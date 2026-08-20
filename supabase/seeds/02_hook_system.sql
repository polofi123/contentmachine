-- ===========================================================================
-- Complete Short-Form Hook System + 7 Hook Modifiers.
-- Sources: complete_short_form_hook_system.md, 7_hook_modifiers.md
--
-- NOTE ON AN OVERLAP: the six spoken building blocks in the source
-- (SUBJECT + ACTION + OBJECTIVE + CONTRAST + PROOF + TIME) are the same six as
-- the existing HOOKW-01..06 from the original canvas. They are NOT duplicated
-- here. Instead the richer definitions are merged into those rows at the
-- bottom of this file, guarded so an edited row is never overwritten.
-- ===========================================================================

insert into layers (id, label, prefix, description, sort_order) values
  ('visual_hook',  'Visual Hooks',   'VHOOK', 'What the first frame does. The visual earns the attention.',      35),
  ('spoken_hook',  'Spoken Hooks',   'SHOOK', 'What the first line does. The spoken hook gives a reason to stay.', 36),
  ('hook_modifier','Hook Modifiers', 'HMOD',  'Stacked on top of a normal hook to make it harder to scroll past.', 37)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The psychology flow and the master build process live in the existing
-- `hook` layer, alongside HOOK-01..08.
-- ---------------------------------------------------------------------------
insert into components (source_id, layer_id, name, body, sort_order, is_seeded) values
  ('HOOK-10','hook','Master Hook System — Lean → Stop → Snapback → Value', $b$**CONTEXT LEAN → SCROLL-STOP INTERJECTION → CONTRARIAN SNAPBACK → VALUE**

- **Context Lean** — make the topic obvious and relevant.
- **Scroll Stop** — interrupt the direction the viewer expects.
- **Contrarian Snapback** — redirect toward a surprising but believable truth.
- **Value** — reward the curiosity immediately.

**Fill in the blank:**
```
[TOPIC + BENEFIT / PAIN / INTERESTING CONTEXT].
But [CHALLENGE THE EXPECTED CONCLUSION].
Because [UNEXPECTED / CONTRARIAN REALITY].
[IMMEDIATE VALUE].
```

The six building blocks (HOOKW-01..06) give you the raw information. This flow decides the order and the tension.$b$, 10, true),

  ('HOOK-11','hook','Visual Hook Formula', $b$```
3–5 WORD TITLE + CLEAR/INTERESTING VISUAL + ENOUGH MOTION + SPOKEN HOOK
```

The visual earns the **attention**. The spoken hook gives a reason to **stay**. A short-form hook combines one visual hook with one spoken-hook format.

**Combination examples:**
- *Setting Down Phone + Contrarian* — "Posting more content is probably the reason your account isn't growing."
- *Many of the Same Prop + List* — "These are the five cameras I'd actually buy if I had to start over."
- *Countdown + Secret Reveal* — "In three seconds, I'm going to show you why this edit doubled my retention."$b$, 11, true),

  ('HOOK-12','hook','Lead with Benefit or Pain', $b$Before explaining the mechanism, explain why the viewer should care.

- **Benefit:** `If you want [DESIRED BENEFIT], [SOLUTION].`
- **Pain:** `If you're struggling with [PAIN], [SOLUTION].`
- **Non-obvious cause:** `The reason you're struggling with [PAIN] may be [NON-OBVIOUS CAUSE].`

Ask: what do they want · what are they avoiding · what frustrates them · what result are they after · can the topic connect to that desire immediately?$b$, 12, true),

  ('HOOK-13','hook','Cult Hopping', $b$Explain an unfamiliar idea through a familiar one.

```
KNOWN THING → UNKNOWN THING
```

Anchors: celebrities · brands · movies · shows · games · companies · popular products · famous events.

- "This is basically the Netflix model for personal brands."
- "Think of your landing page like the Apple Store."
- "This is the Pokémon evolution system, but for businesses."$b$, 13, true),

  ('HOOK-14','hook','Staccato Sentences', $b$Start short. Expand once the viewer is invested.

```
SHORT. SHORT. SHORT.
→ Medium sentence.
→ Longer explanation.
```

Useful rhythm: **Clear statement · Specific fact · Contrast · Payoff.**

> Your hooks are too slow.
> You're wasting the first four seconds.
> But the problem isn't your topic.
> It's your sentence length.$b$, 14, true),

  ('HOOK-15','hook','Master Build Process', $b$1. **Pick the viewer desire** — what do they want, what hurts, what are they curious about?
2. **Fill the six buckets** — subject, action, objective, contrast, (proof), (time).
3. **Create the curiosity loop** — lean → stop → snapback → value.
4. **Choose a spoken format** — one of the thirteen.
5. **Choose a visual format** — one of the forty-seven.
6. **Add on-screen text** — 3–5 words that clarify the topic instantly.
7. **Compress** — remove setup, shorten sentences, move the first useful insight earlier.

**Universal master template:**
```
ON-SCREEN TEXT: [3–5 WORD TOPIC]
VISUAL:         [VISUAL HOOK FORMAT]
SPOKEN:
  [SUBJECT + ACTION + OBJECTIVE / BENEFIT / PAIN].
  But [EXPECTED BELIEF OR NORMAL PATH IS WRONG].
  Because [CONTRARIAN / NON-OBVIOUS REALITY].
  [IMMEDIATE USEFUL INSIGHT].
```
Optional: + contrast + proof + time + familiar cultural reference.$b$, 15, true),

  ('HOOK-16','hook','Final Hook Checklist', $b$Before publishing:

- Is the subject instantly clear?
- Is there a clear action?
- Is the objective/result specific?
- Is there meaningful contrast?
- Would proof strengthen the claim?
- Would a timeframe strengthen it?
- Is the topic obvious immediately?
- Does the viewer know why it matters?
- Is there a reason to lean in?
- Is there an interruption?
- Does the next beat redirect expectations?
- Is the surprise actually valuable?
- Is there strong 3–5 word on-screen text?
- Is there enough visual motion?
- Am I using familiar language or references where useful?
- Does value arrive quickly?
- Are the opening sentences short?
- Does the visual hook support the spoken hook?$b$, 16, true),

  ('HOOK-17','hook','Worked examples — guitar, content, business', $b$**Guitar** — text `WHY SOLOS SOUND BAD`, visual *Holding Prop*
> If your guitar solos still sound like scales, you're probably practicing the wrong thing. But learning more scales won't fix it. Because the problem isn't how many notes you know. It's whether you can connect them melodically. Start with only three notes and make five different phrases.

*Subject = You · Action = practice/solo · Objective = better solos · Contrast = more scales → fewer notes used better · Format = Problem + Contrarian*

**Content** — text `WHY YOUR VIDEOS DIE`, visual *Setting Down Phone*
> If your videos keep dying at 500 views, your hook is probably the problem. But making the first sentence more dramatic won't fix it. Because people often decide to leave before they've even processed what you said. Your visual, title text, and first sentence need to communicate the same idea instantly.

**Business** — text `YOUR REAL SALES LEAK`, visual *A vs. B Comparison Graphic*
> Most businesses don't have a lead problem. They have a conversion problem. But rebuilding your entire website probably won't fix it. Because the biggest leak may happen before anyone reaches your sales page. Compare the promise in your ad with the first sentence on your landing page.$b$, 17, true)
on conflict (source_id) do nothing;

-- ---------------------------------------------------------------------------
-- 13 spoken hook formats.
-- ---------------------------------------------------------------------------
insert into components (source_id, layer_id, name, body, sort_order, is_seeded)
select v.source_id, 'spoken_hook', v.name, v.body, v.sort_order, true
from (values
  ('SHOOK-01','Secret Reveal',       $b$Explain something new.$b$, 1),
  ('SHOOK-02','Case Study',          $b$Break down someone else's success.$b$, 2),
  ('SHOOK-03','Problem',             $b$Lead with a pain the viewer wants solved.$b$, 3),
  ('SHOOK-04','Contrarian',          $b$Challenge a mainstream belief.$b$, 4),
  ('SHOOK-05','Negative',            $b$Warn against a mistake.$b$, 5),
  ('SHOOK-06','Education',           $b$Teach a useful concept.$b$, 6),
  ('SHOOK-07','List',                $b$Promise several useful options.$b$, 7),
  ('SHOOK-08','Scenario / Hypothetical', $b$Explore an imagined situation.$b$, 8),
  ('SHOOK-09','Comparison',          $b$Compare obvious vs. non-obvious options.$b$, 9),
  ('SHOOK-10','Question',            $b$Ask something already blocking the viewer.$b$, 10),
  ('SHOOK-11','Ranking / Rating',    $b$Rank options or strategies.$b$, 11),
  ('SHOOK-12','Authority',           $b$Lead with a desired outcome or credibility.$b$, 12),
  ('SHOOK-13','Personal Experience', $b$Lead with something that happened to you.$b$, 13)
) as v(source_id, name, body, sort_order)
on conflict (source_id) do nothing;

-- ---------------------------------------------------------------------------
-- 47 visual hooks, in their five groups.
-- ---------------------------------------------------------------------------
insert into components (source_id, layer_id, name, body, sort_order, is_seeded) values
  ('VHOOK-G1','visual_hook','Subject Motion',            $b$The hook comes from how you move.$b$, 1, true),
  ('VHOOK-G2','visual_hook','Graphic / Text Overlay',    $b$The hook comes from what is drawn on screen.$b$, 2, true),
  ('VHOOK-G3','visual_hook','Visual Selection',          $b$The hook comes from choosing an arresting first image.$b$, 3, true),
  ('VHOOK-G4','visual_hook','Pattern Interrupt / Switching', $b$The hook comes from a cut or a switch.$b$, 4, true),
  ('VHOOK-G5','visual_hook','Effects / Transitions',     $b$The hook comes from a camera or effect move.$b$, 5, true)
on conflict (source_id) do nothing;

insert into components (source_id, layer_id, name, body, parent_id, sort_order, is_seeded)
select v.source_id, 'visual_hook', v.name, nullif(v.body, ''),
       (select id from components where source_id = v.parent), v.sort_order, true
from (values
  ('VHOOK-01','Point to Visual',        'Point toward the focus visual.',                         'VHOOK-G1', 1),
  ('VHOOK-02','Move in Frame',          'Walk into or around the frame.',                         'VHOOK-G1', 2),
  ('VHOOK-03','Camera Whip',            'Fast camera movement.',                                  'VHOOK-G1', 3),
  ('VHOOK-04','Jump In',                'Enter quickly from the side.',                           'VHOOK-G1', 4),
  ('VHOOK-05','Snap / Pop Reveal',      'Appear through a visual reveal.',                        'VHOOK-G1', 5),
  ('VHOOK-06','Clone / Body Double',    'Multiple versions of yourself.',                         'VHOOK-G1', 6),
  ('VHOOK-07','Fly on the Wall',        'Look off-camera; the viewer observes.',                  'VHOOK-G1', 7),
  ('VHOOK-08','Anticipated Disaster',   'Open on something about to go wrong.',                   'VHOOK-G1', 8),
  ('VHOOK-09','Object Catch',           'Catch something thrown into frame.',                     'VHOOK-G1', 9),
  ('VHOOK-10','Random Product / Pope in the Pool', 'Handle an unrelated object while talking.',   'VHOOK-G1', 10),
  ('VHOOK-11','Setting Down Phone',     'Put the camera down as recording begins.',               'VHOOK-G1', 11),
  ('VHOOK-12','Holding Prop',           'Begin focused on a physical prop.',                      'VHOOK-G1', 12),
  ('VHOOK-13','Many of the Same Prop',  'Show multiple items immediately.',                       'VHOOK-G1', 13),
  ('VHOOK-14','Framebreaker',           'Cut the subject out so they appear outside the frame.',  'VHOOK-G1', 14),
  ('VHOOK-15','Jump Switch',            'Jump and land in a new scene.',                          'VHOOK-G1', 15),
  ('VHOOK-16','3P Crash Zoom',          'Rapid zoom toward another person.',                      'VHOOK-G1', 16),
  ('VHOOK-17','Fridge POV',             'Camera inside a fridge, cabinet, or similar.',           'VHOOK-G1', 17),
  ('VHOOK-18','Write on Screen',        'Physically or digitally write on the screen.',           'VHOOK-G1', 18),
  ('VHOOK-19','Mirror',                 'Speak through a reflection.',                            'VHOOK-G1', 19),
  ('VHOOK-20','Yap Cold Open',          'Start talking immediately.',                             'VHOOK-G1', 20),
  ('VHOOK-21','A vs. B Comparison Graphics', '',                                                  'VHOOK-G2', 1),
  ('VHOOK-22','Text Slide In',          '',                                                       'VHOOK-G2', 2),
  ('VHOOK-23','Interactive Titles',     '',                                                       'VHOOK-G2', 3),
  ('VHOOK-24','Text Arrow Pointer',     '',                                                       'VHOOK-G2', 4),
  ('VHOOK-25','Small Image Drop Overlay','',                                                      'VHOOK-G2', 5),
  ('VHOOK-26','Screen Recording With Motion', '',                                                 'VHOOK-G2', 6),
  ('VHOOK-27','Image Overlay Motion',   '',                                                       'VHOOK-G2', 7),
  ('VHOOK-28','Countdown',              '',                                                       'VHOOK-G2', 8),
  ('VHOOK-29','High-Motion Base B-Roll','',                                                       'VHOOK-G3', 1),
  ('VHOOK-30','Unusual First Image / Scene', '',                                                  'VHOOK-G3', 2),
  ('VHOOK-31','Silent Reaction PIP',    '',                                                       'VHOOK-G3', 3),
  ('VHOOK-32','Visual Mistake',         '',                                                       'VHOOK-G3', 4),
  ('VHOOK-33','Viral Stitch Reaction',  '',                                                       'VHOOK-G4', 1),
  ('VHOOK-34','Match Cut',              '',                                                       'VHOOK-G4', 2),
  ('VHOOK-35','Visual Switch',          '',                                                       'VHOOK-G4', 3),
  ('VHOOK-36','Beat-Match Visual Switch','',                                                      'VHOOK-G4', 4),
  ('VHOOK-37','Viral Stitch Motion Match','',                                                     'VHOOK-G4', 5),
  ('VHOOK-38','Viral Stitch Unlinked Switch','',                                                  'VHOOK-G4', 6),
  ('VHOOK-39','Speed Ramp Effect',      '',                                                       'VHOOK-G5', 1),
  ('VHOOK-40','Zoom In',                '',                                                       'VHOOK-G5', 2),
  ('VHOOK-41','Look Up at Camera / Top Down', '',                                                 'VHOOK-G5', 3),
  ('VHOOK-42','Sudden Danger — 1P POV', '',                                                       'VHOOK-G5', 4),
  ('VHOOK-43','Fish Eye',               '',                                                       'VHOOK-G5', 5),
  ('VHOOK-44','Frame Collapse',         '',                                                       'VHOOK-G5', 6),
  ('VHOOK-45','Crazy Transition',       '',                                                       'VHOOK-G5', 7),
  ('VHOOK-46','Experimental Interactive','',                                                      'VHOOK-G5', 8),
  ('VHOOK-47','Color Switch',           '',                                                       'VHOOK-G5', 9)
) as v(source_id, name, body, parent, sort_order)
on conflict (source_id) do nothing;

-- ---------------------------------------------------------------------------
-- 7 hook modifiers.
-- ---------------------------------------------------------------------------
insert into components (source_id, layer_id, name, body, sort_order, is_seeded)
select v.source_id, 'hook_modifier', v.name, v.body, v.sort_order, true
from (values
  ('HMOD-01','"In ___ Seconds"', $b$Add a specific time constraint to the hook.

> "Seven hook modifiers to absolutely blow up your video in the next 60 seconds."

**Why it works:** it creates a clear expectation and tells the viewer exactly how long they need to stay.$b$, 1),
  ('HMOD-02','Visual Countdown Timer', $b$A visible countdown on screen — e.g. a 60-second greenscreen timer.

**Why it works:** the timer creates urgency and gives a visual reason to keep watching until it finishes.$b$, 2),
  ('HMOD-03','Visual or Numerical Social Proof', $b$Show proof early: view counts · revenue · follower growth · results · screenshots · analytics · before-and-after numbers.

**Why it works:** the biggest reason someone scrolls is deciding you aren't worth their time. Proof answers *"why should I listen to you?"* before they ask it.$b$, 3),
  ('HMOD-04','Objection Handle', $b$Address the doubt before they can scroll.

> "I know you're probably thinking you've already tried this before…"

**Why it works:** it makes the viewer feel understood and removes a reason to dismiss you.$b$, 4),
  ('HMOD-05','The Lego Hook', $b$Start a physical task that will visibly finish by the end of the video — building a Lego set, cutting fruit, drawing, cooking, cleaning, organizing, a puzzle, any satisfying process.

**Why it works:** the viewer now has a *second* reason to stay: they want to see it finished.$b$, 5),
  ('HMOD-06','Early Musical Beat Drop', $b$Music with an intense beat drop inside the first 15 seconds, timed to the reveal.

1. Introduce the problem → 2. build tension → 3. reveal the solution → 4. hit the drop on the reveal.

**Why it works:** the music emphasises the payoff and gives the reveal emotional impact.$b$, 6),
  ('HMOD-07','"Press Here for 2XP"', $b$An interactive-looking visual or text element inside the video.

**Why it works:** it breaks the normal viewing pattern and gives the viewer something unexpected to notice.$b$, 7)
) as v(source_id, name, body, sort_order)
on conflict (source_id) do nothing;

-- ---------------------------------------------------------------------------
-- Merge the richer definitions into the existing six hook words.
--
-- Guarded on the body still matching what the ORIGINAL seed wrote. If you have
-- since edited one of these, the guard fails and your text stands. Running this
-- twice is a no-op for the same reason.
-- ---------------------------------------------------------------------------
update components set body = $b$Who or what is this about?

I · you · we · a person · a company · a product · a technology

*Example:* "If **I** had to grow…"$b$
where source_id = 'HOOKW-01' and body = $b$I, you, we, us, or some subject.

*Example:* "If **I** had to grow…"$b$;

update components set body = $b$What are they doing?

grow · build · make · find · fix · learn · test · double

*Example:* "…had to **grow**…"$b$
where source_id = 'HOOKW-02' and body = $b$Verb or adverb.

*Example:* "…had to **grow**…"$b$;

update components set body = $b$What result are they trying to create? **Shocking and non-obvious.** Prefer specific end states.

- Weak: "grow my channel"
- Stronger: "grow from 0 to 100K subscribers"

*Example:* "…from **0 to 100K subs**…"$b$
where source_id = 'HOOKW-03' and body = $b$Some end state the subject would end up with or on. **Shocking and non-obvious.**

*Example:* "…from **0 to 100K subs**…"$b$;

update components set body = $b$What changes? Sets up the against-the-grain turn.

Common structures: 0 → 100K · before → after · without → with · old way → new way · normal belief → opposite belief · can't → can · slow → fast · expensive → cheap$b$
where source_id = 'HOOKW-04' and body = $b$Sets up the against-the-grain turn.$b$;

update components set body = $b$How quickly, or when? Optional.

in five months · in 90 days · in 20 minutes · in seven days

*Example:* "…**in 5 months**"$b$
where source_id = 'HOOKW-05' and body = $b$Adds a time parameter.

*Example:* "…**in 5 months**"$b$;

update components set body = $b$Why should the viewer believe you? Optional.

"again" · "after testing 500 hooks…" · "after generating 100 million views…" · "I've built three seven-figure businesses…"

*Example:* "…**again**"$b$
where source_id = 'HOOKW-06' and body = $b$What you or the subject has done to qualify the take.

*Example:* "…**again**"$b$;
