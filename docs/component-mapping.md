# Component mapping (Phase 3 proof of concept)

Maps an analysed reference video onto the library components it appears to use, with the evidence for each,
and lets a person confirm or reject every match. Not script generation, not performance correlation, and no
new taxonomy: it only reads a saved analysis and the library.

## What it does

Research page → **Components** tab → **Map to library**. For the video's current saved analysis it proposes
which existing library components (`components.id`) the video uses. Each proposal carries:

- the component (id, source id, name, layer), linked to its definition on `/library#c-<id>`
- evidence: exact transcript quotes with the caption times they span, and visual notes copied from the saved analysis
- for each piece of evidence, whether it **directly shows** the component or is only **context** (and one sentence why)
- an explanation, the verbatim library definition passage the match relies on, and the AI's status (below)
- your review, if any, and the full review history

It never creates a component: an id the model was not offered is discarded.

## Who decides what

| Word | Who | Meaning |
|---|---|---|
| **Confirmed**, **Rejected** | a person | Your decision, recorded as its own row. Nothing else can produce these words. |
| **AI-supported** | the machine | Every automatic check passed (below). Still only a proposal. |
| **Uncertain** | the machine | Something is missing; the reasons are listed on the card. |

The AI's own record (status, confidence, explanation, evidence) is never edited by a review. A review is an
append-only row in `component_mapping_reviews` (`confirmed` / `rejected` / `cleared`, a basis, an optional note,
a time, and a sequence number that decides which is latest). "Withdraw" adds a `cleared` row; earlier rows stay. The app's database role has
only INSERT (four columns) and SELECT on the review table, and no UPDATE/DELETE/TRUNCATE on `component_mappings`, so history and the AI's
record cannot be rewritten by the app (a trigger also refuses UPDATE). Foreign-key cascades from deleting a video still clear them.

**Confirming needs a basis.** You may confirm after just reading a quote only when ALL of these hold: the
evidence includes a transcript quote the relevance check judged to *directly* show the component (20+ characters),
the transcript is a real one (creator-written captions, a subtitle file or a person's paste; not YouTube's automatic captions, `ai`, `sections` or unknown),
and the component is not in a visual layer (`visual_hook`, `visual_layout`, `edit`). In every other case (picture-only
evidence, context-only or unjudged quotes, YouTube auto-captions (speech recognition that may have misheard), an AI-written or unknown
transcript, anything about what is seen) a click
on the AI's own evidence must not become a human-confirmed claim, so you must tick "I watched the video and saw or heard
this". The server enforces this from the stored evidence and the component's layer (`reviewMapping`); the client cannot
loosen it. The tick is a self-attestation: the app cannot check that you watched. The basis is stored with the review.
A confirmation is also refused when the video's analysis has changed since the mappings were made, and a mapping can only be
reviewed on its own video's current run. Rejecting and withdrawing have no such conditions.

**Visual components stay uncertain.** A mapping to a visual-layer component (`visual_hook`, `visual_layout`, `edit`) is never
AI-supported, whatever the evidence: spoken quotes cannot establish a visual technique, and the picture evidence is an AI's unchecked
description of sampled frames. It stays Uncertain until a person who watched the video reviews it.

Re-mapping makes a new run that starts unreviewed. Earlier runs and their reviews are kept in the database; the
page asks before replacing a run that has reviews. **Earlier decisions are shown, never carried over:** when the same component reappears
with at least one identical piece of evidence (same kind, same quote), the card shows "Earlier review, not carried over" with the
decision, its basis and note, and what is different now (the video's analysis or the text the AI read changed, the library definition no
longer contains the matched passage or the component was archived, the evidence is only partly the same). The new mapping is
unreviewed and counts for nothing, including in "you confirmed it in N other videos", until you confirm it again.

## How a run works (same shape as the script analysis in `app/videos/[id]/analysis/pipeline.ts`)

```
saved analysis (transcript + sections + visual notes)
   ├─ observe   model describes what the video does, with NO library text in the prompt
   ├─ retrieve  library search (src/lib/library.ts) finds candidates per observation
   ├─ anchors   four closed layers are shown whole (spoken hooks, formats, story formats, visual layouts)
   ├─ ground    model sees only the candidates and says which the video does (or none)
   ├─ validate  every id, definition excerpt, quote and time is checked in code; failures are dropped
   ├─ judge     a separate call sees ONE piece of evidence beside the definition (never the matcher's
   │            explanation) and says: direct / context / unrelated
   └─ decide    status from code, then one mapping per component (the strongest)
```

**Relevance.** A quote that exists is not a quote that shows anything. `unrelated` evidence is removed (and the
mapping with it if nothing is left). `context` evidence is kept and labelled but cannot make a mapping
AI-supported. For components in visual layers (`visual_hook`, `visual_layout`, `edit`) the judge is told spoken
words are direct only if the speaker literally describes the technique. If the judge call fails, nothing is
marked relevant: every mapping is uncertain and says the check did not run.

**AI-supported** (never for a visual-layer component) requires all of: the model says it is explicit; a transcript quote of 20+ characters that was
judged *direct*; a library definition (20+ chars) whose cited passage was found verbatim; model confidence
at least 0.7; no caveat from the model; a transcript that is not AI-written. Picture-only evidence never gets there.

## Consistency

- **Inputs are deterministic.** Library rows are sorted before indexing; retrieval breaks equal scores by id;
  closed-layer candidates are listed in a fixed order; prompts are built from a fixed snapshot of the saved analysis.
- **Every run records what it was made from**: `input_hash` (transcript, notes, structure), `library_hash`
  (the entries offered), `prompt_version` and `settings`. Equal hashes mean the same material went in.
- **Temperature cannot be lowered here.** The configured Claude model rejects `temperature` outright
  ("deprecated for this model"), and with adaptive thinking it must be 1. The one sampling setting available is
  thinking on or off (`askJson({ thinking })`). Do not expect identical output from identical input.
- Analysis fields the earlier AI wrote as category labels (`personal_experience`, `heros_journey`) are not shown
  to the observation stage: an imported analysis uses this library's own names for them.

## Measured instability (2026-10-19)

**Earlier pipeline version** (no relevance check, same three videos, 2–3 saved runs each, 5 run pairs, prompts
changed slightly between some of them, so treat as indicative): the component sets of two runs of the same
video overlapped by about **57%** (Jaccard), the sets of machine-confirmed components by about **23%**, and
the exact component+quote pairs by about **14%**. Each video had a stable core of 9–10 components found in every
run (mostly the closed-layer classifications and the most explicit devices), around the same number
of components that appeared in only some runs. Which of two near-synonymous hook types got the
machine's top label flipped between runs (`SHOOK-08 Scenario / Hypothetical` vs `SHOOK-10 Question`;
`SHOOK-02 Case Study` vs `SHOOK-10`).

**Current pipeline**: one run per video was completed (to check that the relevance check and the settings
work end to end), then the Anthropic account's credit balance ran out and the planned 18-run comparison
(3 videos x 3 runs x adaptive thinking on/off) could not run. No repeat-run measurement of the current
pipeline exists yet. The three single runs did show the relevance check working: 46 pieces of evidence
judged direct, 58 context-only, and both spoken lines cited for a visual component judged context-only.

So: component IDs and evidence for the weaker, more interpretive matches change from run to run. This is
the reason only a person can confirm, and it is the thing to re-measure before trusting AI-supported.

## Storage

`component_mapping_runs` (one per run, tied to the exact `video_analyses` row it read, with the snapshot),
`component_mappings` (one per component per run; `ai_status`), `component_mapping_reviews` (append-only),
and `component_mappings_current` (current run per video with the latest human decision). `searchMappings()`
in `research/mapping.ts` is not wired to any page. "You confirmed it in N other videos" counts human-confirmed only.

## Limits

- The judge is another model call; it is stricter and independent of the matcher, not infallible.
- "AI-supported" is a proposal. Hook types are not mutually exclusive: one video can fit two.
- Visual evidence is only as good as the saved analysis (1 fps sampling; small text and quick cuts are missed).
- Components with name-only definitions can only ever be uncertain.
- Caption text is attacker-controllable. It is escaped and fenced as data and never treated as instructions, and ids,
  quotes and definition passages are all checked, but the explicit/confidence/caveat fields are the model's own, so
  a crafted caption could still push a false "AI-supported". That is why only a person can confirm.
- Prompts are bounded (transcript 60,000 characters, 40 visual notes, 30 sections).
- Each run is three Claude calls and takes a few minutes. At most one at a time and 20 per hour
  (`MAPPING_MAX_RUNS_PER_HOUR`). Token usage is not recorded.
- Out of scope for now: cross-video search page, script generation, new taxonomy components.

## Known limitations (accepted)

- **Imported transcripts count as "pasted".** An analysis imported from another AI tool with its own `transcript` field is stored with origin
  `pasted`, the same as a transcript a person typed, so it is not held to the stricter "watched the video" rule. The import path
  predates this feature and does not record where the words came from.
- **Confirmations made under earlier rules stand.** A person's earlier "read the quote" confirmation on auto-captions or a visual component is
  kept as history and still counts in "you confirmed it in N other videos"; the card notes that it would not be accepted today.
- **Confirmations keep counting after the analysis moves on.** A confirmation made before a newer analysis was saved stays confirmed on that run;
  the page flags the video as stale, but the cross-video count does not exclude it.
- **The "watched the video" tick is a self-attestation.**
- **Earlier-review matching is exact.** It needs the same component and at least one identical quote; reworded evidence shows no earlier decision.
