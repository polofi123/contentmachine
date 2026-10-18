-- ===========================================================================
-- The storytelling mechanism, as framework data.
--
-- 0010 built the tables. This gives them a vocabulary to point at, so the panel
-- and the diagnostics have something real underneath instead of hardcoded
-- strings — same promise the rest of the framework keeps: naming a new one in
-- /library makes it appear everywhere, with no code change.
--
-- Two new layers and a handful of components filling gaps the original canvas
-- names but never defines. Nothing here overwrites an existing row; every
-- statement is guarded on source_id.
-- ===========================================================================

insert into layers (id, label, prefix, description, sort_order) values
  -- Where uncertainty comes from. STORY-07 says intrigue IS uncertainty and
  -- then stops; these are the mechanisms that actually produce it, so a
  -- question can record what kind of question it is.
  ('tension', 'Tension',    'TEN',  'The mechanisms that make a viewer need the next line.', 57),
  -- STORY-03 (StoryLens) is one paragraph and one example. Perspective is the
  -- highest-leverage decision in the whole model, so the ways of finding one
  -- get to be components you can pick, not a note you have to remember.
  ('lens',    'Story Lens', 'LENS', 'Ways of finding an angle nobody else took.',            58)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- TENSION — where uncertainty comes from.
--
-- These are options, never a checklist. A video with one open question and
-- nothing else can be excellent; the point is to be able to see WHICH kind of
-- uncertainty is running, and where it stops.
--
-- The rule underneath all of them, from STORY-07: the viewer must always know
-- what is happening and why it matters. Uncertainty that breaks either of those
-- is not intrigue, it is confusion.
--
--   bad   — I don't understand what's going on.
--   good  — I understand what's happening, but I need to know what happens next.
-- ---------------------------------------------------------------------------
insert into components (source_id, layer_id, name, body, sort_order, is_seeded)
select v.source_id, 'tension', v.name, v.body, v.sort_order, true
from (values
  ('TEN-01','Problem', $b$Something is wrong and it has not been fixed yet.

The most reliable engine there is, because the viewer supplies the tension themselves — nobody watches a problem being described without starting to want it solved.

> The ads were burning $40,000 and we had three days left.$b$, 1),

  ('TEN-02','Question', $b$A thing the viewer now needs answered.

Give them enough to make a guess and not enough to know. If they cannot form a prediction, there is nothing to be wrong about, and being wrong is the payoff.

> Why would a superstar deliberately defer his own salary?

**Weak version:** "I had a call with a client and it went well." Nothing to predict.$b$, 2),

  ('TEN-03','Mystery', $b$Something happened and the cause is missing.

Distinct from a Question, which points forward. A mystery points backwards — the outcome is already visible and the explanation is not, which is why *start with the ending* works so well as a setup for one.$b$, 3),

  ('TEN-04','Obstacle', $b$The thing standing between where they are and where they are going.

Introduce it before the attempt, not after — an obstacle revealed after the fact is a report. Revealed before, it makes every following line an attempt.$b$, 4),

  ('TEN-05','Counterintuitive information', $b$Something true that should not be.

> Taking less money could actually make him richer.

The strongest of these run against something the viewer already believes, which means the belief has to be stated — or at least assumed out loud — before the reversal has anything to push against.$b$, 5),

  ('TEN-06','Secret / hidden information', $b$Something is deliberately not being said, and the viewer knows it.

The knowing is what matters. Information withheld silently is just missing; information withheld visibly is a promise.$b$, 6),

  ('TEN-07','Missing component', $b$The explanation on the table does not fully account for the facts.

> The team's official reason doesn't explain the timing.

Powerful because it can run underneath an entire middle section: everything gets explained, and the explanation keeps not being enough.$b$, 7),

  ('TEN-08','Prediction', $b$Say what you think will happen, then go and find out.

Puts your credibility on the table, which is what makes the viewer stay for the result. Works even when you turn out to be right — a confirmed prediction still had to resolve.$b$, 8),

  ('TEN-09','Risk', $b$Something can be lost, and the viewer knows what.

Risk is stakes made specific. "It might not work" is not risk; "I'd already spent six months and it was launching Monday" is.$b$, 9),

  ('TEN-10','Conflict', $b$Two forces that cannot both win.

Person against person, choice against consequence, what they wanted against what was possible. Conflict differs from an Obstacle in having two sides with something to say — which is what makes it survivable across several beats.$b$, 10),

  ('TEN-11','Contradiction', $b$Two things are both true and should not be.

> People loved the item. The stores hated making it.

Contradiction is the cheapest way to make a fact feel like a story, because the viewer has to resolve it and the only place to do that is by continuing.$b$, 11)
) as v(source_id, name, body, sort_order)
on conflict (source_id) do nothing;

-- ---------------------------------------------------------------------------
-- LENS — perspective is gold.
--
-- The subject is almost never what makes a story worth watching. The angle on
-- it is. These are ways of generating one, so the obvious reading has to
-- compete instead of winning by arriving first.
-- ---------------------------------------------------------------------------
insert into components (source_id, layer_id, name, body, sort_order, is_seeded)
select v.source_id, 'lens', v.name, v.body, v.sort_order, true
from (values
  ('LENS-00','Perspective is gold', $b$**The topic is not the story. The angle on the topic is the story.**

Two people can cover the same event and only one of them is worth watching. The difference is almost never access or production — it is which question they decided the event was answering.

The ladder, using one topic:

```
TOPIC        Taylor at the NFL game

obvious      Her outfit
             Her arrival
             Her reaction when something happened

less obvious What she might do at the end of the game

unexpected   Her economic impact on the NFL from being there
```

The obvious reading is not wrong. It is just the one everyone else already used, and it arrives first precisely because it is the least specific to you.

**How to use the ladder:** write the obvious one down deliberately. Unwritten, it stays the default; written, it becomes a thing you can decide against.$b$, 0),

  ('LENS-01','The opposite of the topic', $b$Ask the inverted question.

```
expected      Why is this player earning so much?
inverted      Why is this player deliberately taking LESS money?
```

The inversion works because it implies the answer is non-obvious — nobody asks why someone took less money unless there is a reason worth hearing.

Related to HOOK-05, which applies the same move to the opening line. This is the same instinct one level up: not a hook, a whole angle.$b$, 1),

  ('LENS-02','Second-order impact', $b$Skip the event. Cover what the event caused.

The first order is what happened. The second order is what it did to something else — a market, an industry, a group of people who were never mentioned in the story.

Reliably lands in the "unexpected" row of the ladder, because most coverage stops at the first order.$b$, 2),

  ('LENS-03','Predict, then find out', $b$Move the story from the past into the future.

Instead of what happened, ask what happens next — and commit to an answer. Turns a closed subject back into an open one, which is why it can rescue a topic that has already been covered to death.$b$, 3),

  ('LENS-04','The person nobody is looking at', $b$Same event, different pair of eyes.

The person serving, watching, paying, cleaning up afterwards, or losing. A story told from the position with the least power usually has the most tension in it, because that is where the consequences actually land.$b$, 4),

  ('LENS-05','The cost nobody counts', $b$Every visible result has an invisible bill.

Time, relationships, risk, the thing that had to be given up. The result is the part everyone shows; the bill is the part that makes it a story rather than a highlight.$b$, 5)
) as v(source_id, name, body, sort_order)
on conflict (source_id) do nothing;

-- ---------------------------------------------------------------------------
-- STORYTELLING — the pieces the original canvas names but never defines.
--
-- STORY-01..14 already cover Dance, Tone, Rhythm, Direction, Specificity,
-- Meaning and the rest. These are the gaps, added rather than rewritten so the
-- original extraction stays an accurate record of what was on the canvas.
-- ---------------------------------------------------------------------------
insert into components (source_id, layer_id, name, body, sort_order, is_seeded)
select v.source_id, 'story', v.name, v.body, v.sort_order, true
from (values
  ('STORY-15','Mini-stories, not one long arc', $b$One arc across a whole short means one payoff, and everything before it is a promise the viewer has to take on trust.

```
weak                        stronger

HOOK                        HOOK
───────────────────         mini-story  tension → info → twist
30 seconds of explaining    RE-HOOK
───────────────────         mini-story  tension → info → twist
PAYOFF                      RE-HOOK
                            mini-story  tension → info → PAYOFF
```

Each mini-story carries its own small hook and its own small resolution. Build tension, release *some* of it, build again.

Not a rule. A single-arc short can be excellent — this is what to reach for when the middle is going flat.$b$, 15),

  ('STORY-16','Foreshadowing', $b$Promise something specific, later.

```
HOOK        McDonald's banned this item.
FORESHADOW  So I'm making it at home — and then getting it back on the menu.
```

One sentence, and now four questions are open at once: can he recreate it, was it really banned, will they respond, can he actually convince them.

That is the tell of a good foreshadow — it opens more questions than it takes words to say.$b$, 16),

  ('STORY-17','Start with the outcome', $b$Show the result first, then earn it.

*"The last dab."* The interesting thing goes at second zero, and the whole video becomes the answer to **how did we get here**.

Costs you the surprise and buys you the attention. Worth it when the result is more interesting than the process, which — in short form — it usually is.$b$, 17),

  ('STORY-18','Transitions that keep the story going', $b$A transition is a place people leave. Do not spend it on nothing.

```
dead        "Anyway. Let's get started."
alive       "So I cooked it illegally."
```

The second one is still a transition — it moves you from setup to attempt — but it hands over another reason to stay on the way through.

**Test:** if the sentence could be deleted without losing information, it was not a transition, it was a pause.$b$, 18),

  ('STORY-19','Present tense', $b$Optional, and worth knowing about.

```
past      I walked into the room and everyone looked at me.
present   I walk into the room and everyone turns around.
```

Present tense removes the distance between the viewer and the event — it stops being something you are told about and starts being something happening.

Pick one and hold it. Drifting between the two mid-story is more distracting than either choice.$b$, 19),

  ('STORY-20','Story information vs. edit execution', $b$Not everything the viewer learns has to be said, and the two halves belong to different rooms.

```
STORY (make)      The character looks uncomfortable.
EDIT  (execution) Close-up on their hands.
```

The first is information — it changes what the viewer understands. The second is delivery — it changes how they receive it.

Deciding the first while writing is storytelling. Deciding the second while writing is procrastination.$b$, 20),

  ('STORY-21','What is the viewer getting right now?', $b$Speed to value, asked properly.

The wrong question is *how many seconds have passed.* The right one is *what is this section handing over.*

Value is not only information:

```
information · entertainment · emotion · curiosity
surprise · spectacle · usefulness · recognition · humour
```

A section that hands over none of them is dead air, however short it is. A section that hands over one of them has earned its place, however long.

See SCR-07 for the timing numbers; this is the test that matters more than the numbers.$b$, 21)
) as v(source_id, name, body, sort_order)
on conflict (source_id) do nothing;

-- ---------------------------------------------------------------------------
-- Roles for the beats that arrived with the seed.
--
-- 0010 backfills story_role from function_label, but on a fresh `db:reset`
-- migrations run before seeds, so that UPDATE matches nothing and every seeded
-- script opens with no roles at all. Same split 0008 already lives with: the
-- migration moves an existing database, the seed carries the values for a new
-- one.
--
-- Deliberately partial. Only labels that genuinely name a story ROLE are
-- mapped; "Pattern interrupt", "Emotional spike" and "Value stack" are left
-- NULL because they are techniques and delivery notes, not jobs in the arc.
-- Forcing them into the nearest-looking role would be the exact confusion
-- story_role exists to end — and NULL is a valid, expected state anyway.
-- ---------------------------------------------------------------------------
update script_beats set story_role = case lower(trim(function_label))
    when 'hook'                 then 'hook'
    when 're-hook'              then 'rehook'
    when 'rehook'               then 'rehook'
    when 'payoff'               then 'payoff'
    when 'payoff setup'         then 'foreshadow'
    when 'build-up / open loop' then 'question'
    when 'pivot'                then 'transition'
    when 'shift'                then 'transition'
    when 'story'                then 'example'
    when 'cta'                  then 'cta'
  end
  where function_label is not null and story_role is null;

-- Same reason: anything the seed linked to a component becomes a real placement.
insert into script_beat_components (script_beat_id, component_id)
select b.id, b.function_component_id
from script_beats b
where b.function_component_id is not null
on conflict (script_beat_id, component_id) do nothing;

-- ---------------------------------------------------------------------------
-- No new slots.
--
-- Direction, Lens and Tension all sit in the story panel beside the writing,
-- and the `story` slot already exists to mean "narrative devices in play" —
-- filling in a destination marks it filled. Adding three more slots would grow
-- the starting denominator to 20 and turn a creative tool into a progress bar,
-- which is the specific failure the whole workspace is built to avoid.
-- ---------------------------------------------------------------------------
