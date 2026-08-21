-- ===========================================================================
-- SEED — the framework from content-system-theory.md, as data.
--
-- IDEMPOTENT BY DESIGN. Every statement is guarded, so running this against a
-- database you have already edited will only ever insert IDs it has not seen.
-- If you rename "Twist The Knife" in the UI, re-seeding will NOT restore it.
-- That property is the whole reason `source_id` exists.
--
-- Verify with: supabase/scripts/verify.sql
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- LAYERS (§00 prefix table)
-- ---------------------------------------------------------------------------
insert into layers (id, label, prefix, description, sort_order) values
  ('lego',         'Idea Legos',    'LEGO',   'The seven fields that describe any video, mine or theirs.', 10),
  ('mining',       'Idea Mining',   'MINE',   'Finding and decomposing outliers.',                          20),
  ('hook',         'Hooks',         'HOOK',   'Hook construction and delivery.',                            30),
  ('hook_word',    'Hook Words',    'HOOKW',  'The six word types a hook is assembled from.',               40),
  ('script',       'Script',        'SCR',    'Segment structure and speed to value.',                      50),
  ('story',        'Storytelling',  'STORY',  'Narrative devices and drills.',                              60),
  ('checkpoint',   'Checkpoints',   'CHK',    'Sequential gates the viewer passes through.',                70),
  ('trust',        'Trust',         'TRUST',  'Proof and credibility signals.',                             80),
  ('hack',         'Retention Hacks','HACK',  'Techniques applied continuously across checkpoints.',        90),
  ('packaging',    'Packaging',     'PKG',    'Title and thumbnail strategy.',                             100),
  ('thumbnail',    'Thumbnails',    'THUMB',  'Thumbnail design and composition.',                         110),
  ('engagement',   'Engagement',    'ENG',    'Comment and discussion triggers.',                          120),
  ('edit',         'Editing',       'EDIT',   'Edit-pass steps.',                                          130),
  ('distribution', 'Distribution',  'DIST',   'Platform tactics and pillars.',                             140),
  ('prompt',       'Prompts',       'PROMPT', 'Reusable prompts for research and ideation.',               150),
  ('model',        'Models',        'MODEL',  'Standalone conceptual models.',                             160)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- COMPONENTS — parents first, so children can resolve their parent_id.
-- ---------------------------------------------------------------------------

-- §01 The 7 Idea Legos ------------------------------------------------------
insert into components (source_id, layer_id, name, body, sort_order, is_seeded) values
  ('LEGO-01','lego','Topic',           $b$What was the topic?$b$, 1, true),
  ('LEGO-02','lego','Angle',           $b$What was their take / premise / angle?$b$, 2, true),
  ('LEGO-03','lego','Hook',            $b$What was the hook and how was it executed?$b$, 3, true),
  ('LEGO-04','lego','Story structure', $b$How did they structure the story?$b$, 4, true),
  ('LEGO-05','lego','Visual format',   $b$What was the visual layout or visual format?$b$, 5, true),
  ('LEGO-06','lego','Key visuals',     $b$What were the key visuals they used?$b$, 6, true),
  ('LEGO-07','lego','Audio',           $b$Did they use certain audio that worked especially well?$b$, 7, true)
on conflict (source_id) do nothing;

-- §01 Mining process --------------------------------------------------------
insert into components (source_id, layer_id, name, body, sort_order, is_seeded) values
  ('MINE-01','mining','Outlier Research', $b$Find other videos in your niche that already performed well.$b$, 1, true),
  ('MINE-02','mining','Outlier Score',    $b$outlier_score = views_of_one_video / average_views_of_that_channel

Example: 100,000 / 10,000 average = **10x**.

Real example logged from research: a "before/after" thumbnail video scored **37x** at 990K views / 11 views-per-hour on a 1.84M-subscriber channel.$b$, 2, true),
  ('MINE-03','mining','Analyze Outliers'' Lego bricks', $b$Find common patterns across winners.$b$, 3, true),
  ('MINE-04','mining','Hold winners, remix losers',     $b$Hold winning components constant, remix the rest.$b$, 4, true)
on conflict (source_id) do nothing;

-- §02 Hooks -----------------------------------------------------------------
insert into components (source_id, layer_id, name, body, sort_order, is_seeded) values
  ('HOOK-01','hook','Visual Hook', $b$3–4 words displayed immediately on screen that make someone stop and say **"Wait, what?"**$b$, 1, true),
  ('HOOK-02','hook','The Six Hook Words', $b$A hook is assembled from six word types. See the children of this component.

**Worked example:** "If I had to grow from 0 to 100K subs on YouTube, here's how I'd do it" + *in 5 months* + *again*$b$, 2, true),
  ('HOOK-03','hook','Specific over vague', $b$Topic: *Best garden techniques*

**Works:**
- "These are the best garden techniques for ___."
- "I've got these garden techniques."
- "This is the garden technique that you should study."

**Doesn't:**
- "Wait till you see this."
- "You're not gonna believe this."$b$, 3, true),
  ('HOOK-04','hook','Objective-driven examples', $b$> "if you find a girl who believes in your dreams more than you do, who makes you want to be a better man, who's willing to work alongside you to get there, and is grateful for whatever you have right now today, no matter where you're at, **just marry her**"

> "I think if we were smarter, we would listen to 13 year olds more"$b$, 4, true),
  ('HOOK-05','hook','Opposite of Topic creates interest', $b$Lead with the inverse of what the topic implies.$b$, 5, true),
  ('HOOK-06','hook','Hook bank', $b$- "the sound of X vs the sound of Y"
- "the answer to every problem:"
- "life is hard — make it harder" (start with action)
- "today I did something crazy"
- "this is how I started"
- "I used to think X was hard until I did Y"
- "X was going perfectly until Y ruined it"
- "everything I knew about X flipped when I tried Y"
- "let's see if you know this" (but extremely niche)
- "WHEN YOU'RE ABOUT TO…" — video-to-reply format

These are seeded individually into the hooks bank as well.$b$, 6, true),
  ('HOOK-07','hook','Delivery channels', $b$Visual · Auditory hook · Text · Feels like talking to one person · Combine 2 viral topics$b$, 7, true),
  ('HOOK-08','hook','Retention effects', $b$Cloning / fake cliff · Fake battery screen · Split-in-half video with two phones$b$, 8, true)
on conflict (source_id) do nothing;

-- §02 The six hook words (children of HOOK-02) ------------------------------
insert into components (source_id, layer_id, name, body, parent_id, sort_order, is_seeded)
select v.source_id, 'hook_word', v.name, v.body,
       (select id from components where source_id = 'HOOK-02'), v.sort_order, true
from (values
  ('HOOKW-01','Subject Clarity Word',      $b$I, you, we, us, or some subject.

*Example:* "If **I** had to grow…"$b$, 1),
  ('HOOKW-02','Action Word',               $b$Verb or adverb.

*Example:* "…had to **grow**…"$b$, 2),
  ('HOOKW-03','Objective / End State Word',$b$Some end state the subject would end up with or on. **Shocking and non-obvious.**

*Example:* "…from **0 to 100K subs**…"$b$, 3),
  ('HOOKW-04','Contrast Word',             $b$Sets up the against-the-grain turn.$b$, 4),
  ('HOOKW-05','Time Word',                 $b$Adds a time parameter.

*Example:* "…**in 5 months**"$b$, 5),
  ('HOOKW-06','Proof Word',                $b$What you or the subject has done to qualify the take.

*Example:* "…**again**"$b$, 6)
) as v(source_id, name, body, sort_order)
on conflict (source_id) do nothing;

-- §03 Script building -------------------------------------------------------
insert into components (source_id, layer_id, name, body, sort_order, is_seeded) values
  ('SCR-01','script','Segment structure', $b$- Punchy segments of **3 sentences**, ~10–15 seconds each
- Each segment introduces a new piece of information that builds on the last
- **3–4 sentence loops that hook, then re-hook, then re-hook, then re-hook**
- Building tension, releasing it, then building it again
- Short punchy sentences mixed with longer explanatory ones; mini-cliffhangers at the end of each segment$b$, 1, true),
  ('SCR-02','script','Three-beat segment template', $b$1. **Create tension** — "But the big question is this: why is he doing that?"
2. **Provide context** — "His PR team says that his main goal is to win championships and deferring his salary helps the Dodgers afford better players."
3. **Introduce conflict / surprise** — "But I would bet everything that there's a much savvier move being made here."$b$, 2, true),
  ('SCR-03','script','Short form (<30s), 100% retention', $b$- **Hook** — "McDonalds banned this item"
- **Foreshadow** — "so I'm gonna make it at home, then gonna convince them to put it back on the menu"
- **Transition** — not "Let's get started." Instead: **"So I cooked ILLEGALLY"**$b$, 3, true),
  ('SCR-04','script','Speed to Value', $b$Transfer value before the viewer gets bored. **Value at the TOP.**

- Short form: first value by 7–10 seconds
- Long form: first value by 45–60 seconds$b$, 4, true),
  ('SCR-05','script','Beat labels', $b$WHAT'S HAPPENING · WHY? · SUPPORTING FACT · ANSWER · WHAT CAN GO WRONG · HOW TO FIX IT$b$, 5, true),
  ('SCR-06','script','Long-to-short conversion', $b$Turn short-content scripts into long form (and back).$b$, 6, true)
on conflict (source_id) do nothing;

-- §04 Storytelling ----------------------------------------------------------
insert into components (source_id, layer_id, name, body, sort_order, is_seeded) values
  ('STORY-01','story','Dance',        $b$Context + Conflict. Never "and then this happens" — **THEREFORE / BUT**.$b$, 1, true),
  ('STORY-02','story','Tone',         $b$Feel like a conversation. Talk *to* a friend, not *at* them.$b$, 2, true),
  ('STORY-03','story','StoryLens',    $b$See a topic from a lens nobody else has used. Example: *Taylor at the NFL game*.

| Depth | Lens | Example |
|---|---|---|
| Common | Surface | Her outfit, arrival time, reaction to something |
| Less common | Prediction | What she might do at the end of the game |
| Lesser common | Second-order | Her business impact on the NFL for being there |

**Perspective is GOLD.**$b$, 3, true),
  ('STORY-04','story','Rhythm',       $b$Unpredictable rhythm of word lengths.$b$, 4, true),
  ('STORY-05','story','Direction',    $b$Where do you want to take the viewer? What's the last thing they hear? **"The last dab." Start with the ending.**

Devices: Problem/Question/Mystery/Obstacle → Counterintuitive → Secret/hiding → Missing Component.$b$, 5, true),
  ('STORY-06','story','Be Specific',  $b$Senses: sight, smell, hear, taste, touch, emotion.

| Unspecific | Specific |
|---|---|
| "I was nervous before a meeting" | "Oh, my palms were so sweaty and the paper in my hands started to wrinkle from the shaking." |$b$, 6, true),
  ('STORY-07','story','Intrigue comes from Uncertainty', $b$1. Viewer must ALWAYS know WHAT'S HAPPENING → *What's happening*
2. Must know WHY it's IMPORTANT → *Supporting fact*
3. Must know WHAT could GO WRONG → *Head fake / twist*$b$, 7, true),
  ('STORY-08','story','Serial position', $b$You remember the first and last things in a series.$b$, 8, true),
  ('STORY-09','story','Analogies or Examples', $b$Use analogy or concrete example to carry an abstract point.$b$, 9, true),
  ('STORY-10','story','Relive, don''t report', $b$Reporting *informs*. **Relive stories.**

Devices: 6-sentence framework, present tense, body language, visuals.$b$, 10, true),
  ('STORY-11','story','Meaning',      $b$From **yapping** to teaching, inspiring, shifting perspective.

Anchor: *"The reason I'm telling you this is because…"*$b$, 11, true),
  ('STORY-12','story','Facts become memorable through story', $b$A fact alone does not stick; a fact inside a story does.$b$, 12, true),
  ('STORY-13','story','Persuasion surface', $b$Beliefs, trusted sources, and values.$b$, 13, true),
  ('STORY-14','story','Practice drills', $b$- Screenshot any text that makes you feel something
- Write down the name of everyone you meet and tell yourself their story
- Take pictures of small details (sidewalks etc.) to develop stories
- Pick a random word and tell yourself a story about it
- Listen to a video without looking — analyze tone and rhythm
- Watch the same video on mute — analyze facial reactions and body language$b$, 14, true)
on conflict (source_id) do nothing;

-- §05 Checkpoints -----------------------------------------------------------
insert into components (source_id, layer_id, name, body, sort_order, is_seeded, is_placeholder) values
  ('CHK-01','checkpoint','Checkpoint 1: Painpoint Acceptance', $b$**10–30 seconds.**

State: the viewer is highly aware of the problem and eager to explore potential solutions.

By applying the four hacks below, you:
1. Make them aware of the core issue
2. Show how the problem applies to their unique situation
3. Emphasize the need to act and bridge the distance to their goal

**Pain point categories — "the four horsemen":** Not enough money · Lack of time · Poor health · Limited access

**Reframe pattern:**
> "if you want to make more money, do this ____"
> "so instead of *how to fix your life*, do this — it's *finding a purpose* that will fix your life"

**Deepening the gap** (related, distinct from the four hacks):
> "If you've been struggling with storytelling, I've been there, I know how hard it is." — reminds them of the struggle, deepens the gap.$b$, 1, true, false),

  ('CHK-02','checkpoint','Checkpoint 2: Sprint to Trust', $b$**10–30 seconds.**

> "The viewer has now accepted that a pain point is there. They want to solve it and they now trust you as a potential vehicle that could solve it."

**Common Ground (been in their shoes):**
- "I've been exactly where you are"
- "I know what it feels like"
- "I've gone through this same thing"

**Trust Transfer — the three objections you must defeat:**
1. You have no idea what you're saying
2. You can't prove you've done this before
3. You don't have the answer

**Proof formats:** Screenshots · Bank statements · A/B tests · Before and afters · Social followings

**Studio Quality test:** How does this person not have any wins? How does this person not have any proof?

**The two trust laws (they pull against each other):**
- The **deeper the pain**, the **less trust** required
- The **bigger the ask**, the **more trust** required

**Progress marker:** "The viewer has accepted there's a pain point to solve. They trust and know you have a plan to solve it."$b$, 2, true, false),

  ('CHK-03','checkpoint','Checkpoint 3: Plan of Attack', $b$**Under 1 minute.**

Requirements:
- You need to share that you have a plan
- Explain why your plan is different than anything else they've seen before

Also: faster way to fix the problem · point of difference / contrast / curiosity loop

**Macro arc across all three checkpoints:** Create a problem → they trust you → suggest something different$b$, 3, true, false),

  ('CHK-04','checkpoint','Checkpoint 4 — not yet recovered', $b$The source framework states **six** checkpoints ("six gates or checks"), but the canvas only transcribes three.

Checkpoints 4–6 likely cover: delivering the plan's content, the CTA/close, and re-engagement — inferred from the Checkpoints Recap, which lists five *outcomes* that don't map 1:1 onto the three transcribed checkpoints.

This is an open slot in the schema, not a gap to force-fill. Name it when you recover it.$b$, 4, true, true),

  ('CHK-05','checkpoint','Checkpoint 5 — not yet recovered', $b$See CHK-04. Structurally implied by the source, never transcribed.$b$, 5, true, true),
  ('CHK-06','checkpoint','Checkpoint 6 — not yet recovered', $b$See CHK-04. Structurally implied by the source, never transcribed.$b$, 6, true, true),

  ('CHK-RECAP','checkpoint','Checkpoints Recap', $b$1. Established a pain point
2. Built trust
3. Laid out a plan
4. Earned their approval
5. Kept them re-engaged to deliver your value$b$, 90, true, false),

  ('CTA-01','checkpoint','CTA Moment', $b$**Recap structure:** tell the viewer what you're going to do → take the action → remind them at the end of what you've done

**Unexpected Surprise:** quality that surprises

**Remind to Close the Loop:** at the end of the video, tell the viewer you've bridged the solution gap, giving them all they need to solve it themselves — but if they want faster results, they can take action or purchase your product$b$, 95, true, false)
on conflict (source_id) do nothing;

-- CHK-01 sub-hacks (children) ----------------------------------------------
insert into components (source_id, layer_id, name, body, parent_id, sort_order, is_seeded)
select v.source_id, 'checkpoint', v.name, v.body,
       (select id from components where source_id = 'CHK-01'), v.sort_order, true
from (values
  ('CHK-01a','One Standard Deviation', $b$Understand which of the four-horsemen pains you're targeting, then figure out how to go one standard deviation away to solve a *tactical* problem — not the obvious surface pain, the adjacent specific one.$b$, 1),
  ('CHK-01b','Twist The Knife',        $b$Talk about the pain point and that frustration as bluntly and directly as possible. Uses FOMO and jealousy — remind them of it.$b$, 2),
  ('CHK-01c','Audience of One',        $b$Focus on "you" — make it about them, their situation, their challenges. Governs tone/rhythm throughout.$b$, 3),
  ('CHK-01d','Pain Point ___ Solution Gap', $b$Help them see the pain point and the gap between where they are now and where they want to be.$b$, 4)
) as v(source_id, name, body, sort_order)
on conflict (source_id) do nothing;

-- TRUST-01 (child of CHK-02) -----------------------------------------------
insert into components (source_id, layer_id, name, body, parent_id, sort_order, is_seeded)
select 'TRUST-01','trust','The six trust signals',
  $b$Proof hierarchy, strongest to weakest as transcribed:

1. Proof of solving for someone like them
2. Proof of solving for yourself
3. Massive social follower counts or respected cosigns
4. Evidence that you've been in their shoes but aren't anymore
5. Common ground
6. The look / sound / vibe$b$,
  (select id from components where source_id = 'CHK-02'), 1, true
on conflict (source_id) do nothing;

-- ORDER-01 and PKG-DIFF (children of CHK-03) --------------------------------
insert into components (source_id, layer_id, name, body, parent_id, sort_order, is_seeded)
select v.source_id, v.layer_id, v.name, v.body,
       (select id from components where source_id = 'CHK-03'), v.sort_order, true
from (values
  ('ORDER-01','checkpoint','Ordered List', $b$Order / alignment. Why structure works:

1. Helps them remember things
2. They feel smart
3. They associate feeling smart with you
4. They trust you more

Phrasing: *"These are my 18 psychology hacks"* / *"These are my five tips for doing X"*$b$, 1),
  ('PKG-DIFF','packaging','Point of Difference', $b$> "Everyone tells you to study this, buy this — but I tell you don't do any of those, instead…"$b$, 2)
) as v(source_id, layer_id, name, body, sort_order)
on conflict (source_id) do nothing;

-- §05 Hacks — 7 named, 11 placeholders (18 total per the source) -------------
insert into components (source_id, layer_id, name, body, sort_order, is_seeded, is_placeholder) values
  ('HACK-01','hack','Open Loops',     $b$Dopamine release / validates. **Loops people have to hunt and close.**

Most valuable information first, then tease/bury content through the rest of the video. Remind the viewer of the gold at the end. Long and mini loops.$b$, 1, true, false),
  ('HACK-02','hack','Re-hooking',     $b$The best approach is to repeatedly highlight the gap between their current state and desired outcome. Remind them where they are and where they want to be, creating contrast.

*"That point was good, but if you don't connect this, then it won't work."*$b$, 2, true, false),
  ('HACK-03','hack','Trance Rhythm',  $b$MUSIC.$b$, 3, true, false),
  ('HACK-04','hack','Likability',     $b$Create a strong enough connection that they feel compelled to keep watching your content.$b$, 4, true, false),
  ('HACK-05','hack','Authenticity',   $b$Label only — full definition not recovered from the source.$b$, 5, true, false),
  ('HACK-06','hack','Simplification', $b$Expressing ideas clearly using straightforward language and concise sentences to ensure easy understanding. Repeat points twice, use metaphor.$b$, 6, true, false),
  ('HACK-07','hack','Energy',         $b$Read line by line.$b$, 7, true, false)
on conflict (source_id) do nothing;

-- The remaining 11 of 18. Represented on the source canvas only as unlabeled
-- dots along the brain path. Seeded as placeholders so the library can say
-- "11 more hacks exist in the source framework, not yet named" rather than
-- pretending the model is complete. Do not invent names for these.
insert into components (source_id, layer_id, name, body, sort_order, is_seeded, is_placeholder)
select
  'HACK-' || lpad(n::text, 2, '0'),
  'hack',
  'Hack ' || n || ' — not yet named',
  $b$The source framework states 18 hacks. Only 7 were transcribed by name; the rest appear on the canvas as unlabeled dots along the brain path. This is an open slot — name it if you recover it.$b$,
  n, true, true
from generate_series(8, 18) as n
on conflict (source_id) do nothing;

-- §06 Packaging -------------------------------------------------------------
insert into components (source_id, layer_id, name, body, sort_order, is_seeded) values
  ('PKG-01','packaging','The four packaging questions', $b$Ask these of every thumbnail/title pair before shipping:

1. Does the viewer desire what you're saying or showing in the title/thumbnail?
2. Do they trust that you're gonna be the one to deliver it, based on what you show in the thumbnail?
3. If using a face, does its emotion match what the viewer should feel watching the video?
4. What is the desire loop or interest loop I'm trying to create with this packaging?$b$, 1, true),
  ('PKG-02','packaging','Desire loop vs. Interest loop', $b$| Video type | Loop | Definition |
|---|---|---|
| Educational | **Desire loop** | Use words to trigger a pain point that's preventing a desire they want (ex: money, growth, followers) |
| Entertainment | **Interest loop** | Use words to trigger curiosity around a question they have that's unanswered |

This is a real fork — decide which loop a video is running before writing the hook, because the two are built differently.

*(Recorded per-video on `videos.loop_type`.)*$b$, 2, true)
on conflict (source_id) do nothing;

-- §06 Thumbnails ------------------------------------------------------------
insert into components (source_id, layer_id, name, body, sort_order, is_seeded) values
  ('THUMB-01','thumbnail','The 7 Core Elements of Thumbnail Design', $b$Faces with emotion · Visually compelling graphic · Large text, numbers, or dollars · Aesthetic imagery · Maximalist design collage · Red arrows/circles · Color contrast$b$, 1, true),
  ('THUMB-02','thumbnail','The 3 Types of Thumbnail Composition', $b$| Type | Definition |
|---|---|
| Symmetrical | Main subject is in the middle of the image |
| Asymmetrical | Main subject is off to the side, following the rule of thirds |
| A/B | Thumbnail is split into two sections to visually show a before/after transformation |$b$, 2, true),
  ('THUMB-03','thumbnail','The 4 Ways to Pick the Right Visual', $b$1. Show the end state
2. Show the before/after of the transformation
3. Show a visual of a step or the full transformation process (a tip, framework, step, pyramid, storyflow, etc.)
4. Show the anti-transformation state — aggravating the pain (example logged: a person alone in a crowd, labeled "Alone")$b$, 3, true),
  ('THUMB-04','thumbnail','Thumbnail Concepting — 3 Steps', $b$1. **List your elements** — text phrases and graphic items you might use
2. **Sketch layout ideas** — quick pencil sketches to explore compositions
3. **Find composition inspiration** — look at top-performing thumbnails in your niche (tools referenced: One of 10, vidIQ)$b$, 4, true),
  ('THUMB-05','thumbnail','Reference examples logged during research', $b$- "I tried the CIA Gateway process...and unlocked a new reality.." — Aaron Doughty, 1.84M subs, 990K views, 2yr, **37x outlier score** — before/after split-face composition
- "Why You Are Not Happy" — red/black text-heavy composition, "INSIGNIFICANT" as focal word
- "Why Nihilism is Taking Over Modern Society" — red-highlighted figure among grayscale crowd (same visual logic as THUMB-03 #4)$b$, 5, true)
on conflict (source_id) do nothing;

-- §07 Engagement ------------------------------------------------------------
insert into components (source_id, layer_id, name, body, sort_order, is_seeded) values
  ('ENG-01','engagement','Commentary value', $b$Your content should trigger an emotional reaction that sparks discussion in the comments or group chats.$b$, 1, true),
  ('ENG-02','engagement','Target emotions',  $b$Shock · Sadness · Fear · Awe/Inspiration$b$, 2, true),
  ('ENG-03','engagement','The Three Comments Test', $b$Before publishing: *"What are the top three comments I expect to see from this video?"*

- **Super fan** —
- **Neutral observer** —
- **Super hater** —$b$, 3, true),
  ('ENG-04','engagement','Three tactics', $b$1. **Take a clear, bold POV** — energize supporters and spark debate
2. **Use emotionally leading words** — name the feeling you want (e.g. "this is scary")
3. **Seed the impact** — drop a subtle line showing how the target group will be affected$b$, 4, true),
  ('ENG-05','engagement','Funnel', $b$Newsletter / Discord / Value / Discord$b$, 5, true)
on conflict (source_id) do nothing;

-- §08 Editing ---------------------------------------------------------------
insert into components (source_id, layer_id, name, body, sort_order, is_seeded) values
  ('EDIT-01','edit','Cut out mistakes', $b$$b$, 1, true),
  ('EDIT-02','edit','Cut waffle',       $b$$b$, 2, true),
  ('EDIT-03','edit','Limit jump cuts',  $b$$b$, 3, true),
  ('EDIT-04','edit','Use text',         $b$$b$, 4, true),
  ('EDIT-05','edit','Show don''t tell', $b$$b$, 5, true)
on conflict (source_id) do nothing;

-- §11 Distribution ----------------------------------------------------------
insert into components (source_id, layer_id, name, body, sort_order, is_seeded) values
  ('DIST-IG','distribution','Instagram', $b$Hashtag rotation: 3 niche-specific · 2 niche + 1 viral · 2 viral. Enable Hype. Remix and clipping feature on. Fix audience by geography.$b$, 1, true),
  ('DIST-YT','distribution','YouTube',   $b$Niche part of name, or second name.$b$, 2, true),
  ('DIST-TT','distribution','TikTok',    $b$5 keywords in the description.$b$, 3, true),
  ('DIST-ALL','distribution','All platforms', $b$Remarkable profile picture. Make the thumbnail actually clickable if they're on your profile.

Posting windows: **10–11 AM · 1–2 PM · 4–6 PM**. **50% trendy / 50% search.** Linking.$b$, 4, true),
  ('DIST-PILLARS','distribution','Content pillars', $b$Skateboarding · Music · Entertainment · Way of life · Curiosity · Helping people$b$, 5, true),
  ('DIST-FORMATS','distribution','Formats', $b$How-to · Vlog · Personality/mixture (not just a character) · Devil's advocate$b$, 6, true),
  ('DIST-PERSPECTIVE','distribution','Perspective', $b$3 sides of the coin · Perspectives · "Living the moment is what brings happiness" · "Change happens every day"$b$, 7, true)
on conflict (source_id) do nothing;

-- §10 Prompts ---------------------------------------------------------------
insert into components (source_id, layer_id, name, body, sort_order, is_seeded) values
  ('PROMPT-01','prompt','B-roll sourcing', $b$I'm writing a short-form video script. I have the script done. I now need to find a bunch of YouTube video source links that I can give to my editor so they can best visualize the lines in the script. When I say visualize, what I mean is that a viewer needs to hear my words and see the visuals and have increased comprehension of what I'm saying. So for example, if I say "this guy designed the original iPhone," I would think to have a visual of Jony Ive with Steve Jobs from 2006 in Apple's headquarters working on it. Can you find me 10 source links of YouTube videos that would have various b-roll clips for us to use for the following script?$b$, 1, true),
  ('PROMPT-02','prompt','Video idea generation', $b$I'm a creator that makes videos about [niche]. Here is my channel [URL]. I'm looking for a list of new video ideas to cover. Typically, the best ideas are targeting the biggest unmet needs and/or pain points that my target audience has. My target audience is [audience]. You can see on my channel which videos have outperformed relative to the others. Can you do a full deep dive on my channel (and others in the category) and give me 10 new ideas for videos I should make. For each one, break down the idea, the title, and a description for why you think this idea would do well for me. Feel free to ask me any follow-up questions before you run the full process.

> Template captured from a marketing channel example — swap niche/audience/URL for your own before use.$b$, 2, true)
on conflict (source_id) do nothing;

-- §11 Models ----------------------------------------------------------------
insert into components (source_id, layer_id, name, body, sort_order, is_seeded) values
  ('PASSION-01','model','The Calling model', $b$Three overlapping circles: **Passion · Proficiency · Profitability.**

| Overlap | Result |
|---|---|
| Passion + Proficiency (no profitability) | Hobby |
| Proficiency + Profitability (no passion) | Failure |
| Passion + Profitability (no proficiency) | Boredom |
| All three | **Calling** |$b$, 1, true)
on conflict (source_id) do nothing;

-- ---------------------------------------------------------------------------
-- SLOTS — what a video build can care about.
-- `in_default_template` is the counterweight to "everything is optional":
-- a new video starts with an opinion instead of a blank page.
-- ---------------------------------------------------------------------------
-- `workflow_stage` routes the slot to a workspace: MAKE is what the video says,
-- EDIT is how it is assembled, shared belongs to neither. Migration 0008 adds
-- the column; the values live here because on a fresh reset the migration's
-- UPDATEs run before these rows exist.
insert into slots (key, label, layer_id, description, in_default_template, sort_order, workflow_stage) values
  ('legos',        'Idea Legos',       'lego',         'The seven fields that describe this video.',          true,  10,  'make'),
  ('hook',         'Hook',             'hook',         'The opening line and its word types.',                true,  20,  'make'),
  ('loop_type',    'Desire / Interest','packaging',    'Which loop is this video running? Decide before writing the hook.', true, 30, 'make'),
  ('script',       'Script',           'script',       'Beat-structured script.',                             true,  40,  'make'),
  ('retention',    'Retention hacks',  'hack',         'Which hacks are planted, and where.',                 true,  50,  'make'),
  ('checkpoints',  'Checkpoints',      'checkpoint',   'Which psychology gates the opening passes through.',  true,  60,  'make'),
  ('packaging',    'Title & thumbnail','thumbnail',    'Composition, visual choice, text.',                   true,  70,  'shared'),
  ('engagement',   'Engagement',       'engagement',   'Three Comments Test and target emotions.',            true,  80,  'shared'),
  ('story',        'Story devices',    'story',        'Narrative devices in play.',                          true,  90,  'make'),
  -- Now on the default template: EDIT is a workspace of its own, and a new
  -- video that opts into no edit slots would open it to an empty screen.
  ('edit',         'Edit pass',        'edit',         'Edit steps and spec.',                                true,  100, 'edit'),
  ('distribution', 'Distribution',     'distribution', 'Per-platform tactics for this video.',                false, 110, 'shared')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- HOOKS BANK (HOOK-06) — free-floating, not attached to any video.
-- ---------------------------------------------------------------------------
insert into hooks (text, notes)
select v.text, 'Seeded from HOOK-06 hook bank.'
from (values
  ('the sound of X vs the sound of Y'),
  ('the answer to every problem:'),
  ('life is hard — make it harder'),
  ('today I did something crazy'),
  ('this is how I started'),
  ('I used to think X was hard until I did Y'),
  ('X was going perfectly until Y ruined it'),
  ('everything I knew about X flipped when I tried Y'),
  ('let''s see if you know this'),
  ('WHEN YOU''RE ABOUT TO…')
) as v(text)
where not exists (select 1 from hooks h where h.text = v.text);

-- ---------------------------------------------------------------------------
-- IDEA BANK (§09)
-- ---------------------------------------------------------------------------
insert into ideas (title, niche, format, note)
select v.title, v.niche, v.format, v.note
from (values
  -- IDEA-MUSIC-*
  ('Top 10 Records of the Century','music','ranking',null),
  ('AI artists','music',null,null),
  ('Real or AI?','music',null,null),
  ('Spotify top 10','music','ranking',null),
  ('Weird ways to make songs / Pink Floyd','music',null,null),
  ('Trying to make a song out of weird sounds','music','challenge',null),
  ('I Made a Song Using ONLY My Bedroom (No Fancy Gear)','music','challenge',null),
  ('Using AI to make lyrics','music',null,null),
  ('Making songs with AI','music',null,null),
  ('Using AI to improve my voice','music',null,null),
  ('Benny Blanco','music',null,null),
  ('Pharrell Williams','music',null,null),
  ('Making my first song (or at least a good one)','music',null,null),
  ('How to rhyme with imperfect rhymes','music','how-to',null),
  ('Trying to make a song with free plugins','music','challenge',null),
  ('Artists supposedly killed by the industry (Lil Peep, Avicii, Mac Miller)','music',null,null),
  ('Do you have the skill of finger independence?','music',null,null),
  ('The Psychology of Psychedelic Music (And How to Make It)','music','how-to',
   'Break down what makes music sound psychedelic (reverb, delay, panning, phasing); build a beat, transform it step-by-step; explain the *why* behind each effect.'),
  ('I Locked Myself Away for 7 Days to Make Music (Here''s What Happened)','music','challenge',null),
  ('Nostalgia as a Drug: How to Make Music That Feels Timeless','music','how-to',
   'Analyze nostalgic songs (incl. Tame Impala''s The Slow Rush), break down chord progressions/vintage sounds/lyrics, make your own.'),
  ('I Spent 6 Weeks Making an Album (Daft Punk''s Speed Challenge)','music','challenge',
   'Recreate Human After All''s constraints: two guitars, drum machine, 8-track.'),
  ('Why the Best Artists Hide Their Face (And Should You?)','music',null,
   'Anonymity psychology (Daft Punk, Marshmello, Deadmau5); wear a mask, then reveal.'),
  ('I Performed as a "Robot" for a Week (Social Experiment)','music','challenge',
   'Mysterious persona for a week, track engagement, reveal and discuss.'),
  -- IDEA-PHIL-*
  ('How to be different (don''t just believe — understand it)','philosophy',null,null),
  ('How to break addiction','philosophy','how-to',null),
  ('Work philosophies and how to find your own','philosophy',null,null),
  ('How to find your path','philosophy','how-to',null),
  ('Is man made to be evil?','philosophy',null,null),
  ('The math behind success','philosophy',null,null),
  ('How to arrange your week to your goals','philosophy','how-to',null),
  ('Habits to change your life','philosophy',null,null),
  ('Philosophers'' takes on AI','philosophy',null,null),
  ('Red light','philosophy',null,null),
  ('Purpose (word meaning)','philosophy',null,null),
  ('How to feel happy','philosophy','how-to',null),
  ('What is the direction you should take?','philosophy',null,null),
  ('Why you are stuck','philosophy',null,null),
  ('Looksmaxxing — should you try it?','philosophy',null,null),
  ('Cult hopping','philosophy',null,null),
  ('Why you shouldn''t trust certain content creators','philosophy',null,null),
  -- IDEA-CHALLENGE-*
  ('Probabilities of the future with AI','challenge',null,null),
  ('Using the book Atomic Habits','challenge',null,null),
  ('Writing a song every day until it peaks','challenge',null,null),
  ('Trying to master a dance move','challenge',null,null),
  ('Trying to air walk','challenge',null,null),
  ('How to do the self straw trick','challenge','how-to',null),
  ('Trying to learn a Webster','challenge',null,null),
  ('Talking to my past self but it''s only been a day','challenge',null,null),
  ('Hiding myself between blank to see if anyone notices','challenge',null,null),
  ('My girlfriend before she got brain trauma','challenge',null,null),
  ('Cuts shadow boxing','challenge',null,'Not done yet.'),
  ('Day in the life','challenge','vlog',null),
  -- IDEA-FORMAT-*
  ('Ranking',null,'format',null),
  ('Iceberg',null,'format',null),
  ('Q&A milestones',null,'format',null)
) as v(title, niche, format, note)
where not exists (select 1 from ideas i where i.title = v.title);

-- ---------------------------------------------------------------------------
-- VIDEOS — one real outlier from §06 research, with real numbers, so the
-- outlier-score view has something to compute on day one.
-- ---------------------------------------------------------------------------
insert into videos (title, is_mine, platform, url, channel_name, channel_avg_views,
                    lego_topic, lego_angle, lego_hook, lego_visual_format, lego_key_visuals, notes)
select
  'I tried the CIA Gateway process...and unlocked a new reality..',
  false, 'youtube', 'https://www.youtube.com/watch?v=y3NMuXnDiWM',
  'Aaron Doughty', 26757,
  'CIA Gateway process / consciousness',
  'First-person experiment with a declassified government protocol',
  'Curiosity gap on a secret institutional document plus a personal transformation claim',
  'Before/after split-face composition',
  'Split-face before/after, high colour contrast',
  'Logged in THUMB-05. 1.84M subs, 990K views over 2 years, 11 views-per-hour, ~37x outlier score. channel_avg_views back-derived from the 37x figure so the outlier_score view reproduces it.'
where not exists (
  select 1 from videos v where v.url = 'https://www.youtube.com/watch?v=y3NMuXnDiWM'
);

insert into video_metrics (video_id, views, note)
select v.id, 990000, 'As logged during research (2yr after publish).'
from videos v
where v.url = 'https://www.youtube.com/watch?v=y3NMuXnDiWM'
  and not exists (select 1 from video_metrics m where m.video_id = v.id);

-- The purpose video — your own, still unpublished. Carries SCRIPT-04/05/06/07.
insert into videos (title, is_mine, status, loop_type, platform,
                    lego_topic, lego_angle, lego_hook, lego_story_structure, notes)
select
  'The Purpose of Life (And Why You''re Looking in the Wrong Place)',
  true, 'scripting', 'desire', 'youtube',
  'Purpose / meaning of life',
  'Purpose is not found, it is chosen — and it is a ratio, not a destination',
  'Ask the viewer to lock in their answer before you give yours',
  'Existentialism + Stoicism, career example, three-step framework, obstacles, close',
  'THUMB-FRAME-01: Desire = you want to die happy and purpose will help you. Pain point = "I don''t know what path or what to do with my life". Solution = philosophy, tips, and understanding that regret is inevitable. Click test = "If I click on this video, will it help me find purpose and help my day to day?" Rule: 10-80-10.

Keyword targets: career · success · growth · lost and confused · meaning of life · what path to take.

Title/thumbnail text variants: "What''s your purpose?" · "A path" · "a lost man" · "BEFORE YOU WASTE YOUR LIFE" · "Feeling Lost?" · "How to find: PURPOSE" · "the SECRET to make you HAPPY" · "WHY YOU ARE NOT HAPPY" · "WHY YOU feel LOST"

Self-note from the canvas: "MAN STOP THE BEGGING" — flagged own CTA as too needy.'
where not exists (
  select 1 from videos v
  where v.title = 'The Purpose of Life (And Why You''re Looking in the Wrong Place)'
);

-- Default slots for the purpose video, so the completeness view has a subject.
insert into video_slots (video_id, slot_key, state)
select v.id, s.key, 'empty'
from videos v
cross join slots s
where v.title = 'The Purpose of Life (And Why You''re Looking in the Wrong Place)'
  and s.in_default_template
  and not exists (
    select 1 from video_slots vs where vs.video_id = v.id and vs.slot_key = s.key
  );

-- ---------------------------------------------------------------------------
-- SCRIPTS — the beat-timed ones seed directly (SCRIPT-05/06/07).
-- ---------------------------------------------------------------------------
insert into scripts (video_id, name, duration_target_sec, format, edit_spec)
select v.id, 'Purpose — 30s cut', 30, 'short',
  $b$Talking head, moody or natural light + soft focus. Text overlay keywords ("blueprint," "purpose," "money," "empty," "build") in muted white/pale gold. **Re-hook cut-ins at 3s, 12s, 19s, 36s** — minor zoom or jump-cut. B-roll: money piles, crowd walking, mirror reflection at "whose blueprint am I following?" SFX: faint ambient hum fading to silence at the last line.$b$
from videos v
where v.title = 'The Purpose of Life (And Why You''re Looking in the Wrong Place)'
  and not exists (select 1 from scripts s where s.video_id = v.id and s.name = 'Purpose — 30s cut');

insert into scripts (video_id, name, duration_target_sec, format, edit_spec)
select v.id, 'Fear of Failing — 45s', 45, 'short',
  $b$Opening frame direct to camera, soft lighting, slight zoom-in. 8–15s text overlay: "The obstacle *is* the way." Dimmer tone before "He found meaning…" Ambient piano or minimal strings. Bold subtitles on *fail*, *purpose*, *meaning*, *becoming*. Fade out on soft eye contact.

Tone: reflective, cinematic, calm intensity.$b$
from videos v
where v.title = 'The Purpose of Life (And Why You''re Looking in the Wrong Place)'
  and not exists (select 1 from scripts s where s.video_id = v.id and s.name = 'Fear of Failing — 45s');

insert into scripts (video_id, name, duration_target_sec, format, edit_spec)
select v.id, 'Not Lost, Waiting — 30s', 30, 'short',
  $b$Staring at camera, half in shadow. Quick zoom on "never gonna arrive." B-roll of walking alone, writing, small creative work. Text on-screen per introspective question. Desaturated/warm golden tones. Calm, resolved CTA delivery — not preachy.$b$
from videos v
where v.title = 'The Purpose of Life (And Why You''re Looking in the Wrong Place)'
  and not exists (select 1 from scripts s where s.video_id = v.id and s.name = 'Not Lost, Waiting — 30s');

insert into scripts (video_id, name, duration_target_sec, format, edit_spec)
select v.id, 'Purpose — long form', 720, 'long',
  $b$Section map:
1:00–3:30 The Trap We're All In
3:30–6:00 The Counterintuitive Truth (Existentialism + Stoicism)
6:00–7:45 The Career Example
7:45–10:30 How to Actually Do This
10:30–11:15 The Truth About Obstacles
11:15–12:00 Closing$b$
from videos v
where v.title = 'The Purpose of Life (And Why You''re Looking in the Wrong Place)'
  and not exists (select 1 from scripts s where s.video_id = v.id and s.name = 'Purpose — long form');

-- SCRIPT-05 beats -----------------------------------------------------------
insert into script_beats (script_id, sort_order, t_start_sec, t_end_sec, function_label, text)
select s.id, v.sort_order, v.t0, v.t1, v.label, v.text
from scripts s
join videos vid on vid.id = s.video_id
cross join (values
  (1, 0, 3,  'Pattern Interrupt',   'Pause, eye contact. Slight zoom-in.'),
  (2, 4, 10, 'Build-up / Open Loop','"If I asked you right now, ''What''s the meaning of life?'' you''d probably say something I just said you shouldn''t follow." → "But before I tell you the truth — lock in your answer. Seriously. Comment it, or just say it in your head."'),
  (3, 11,20, 'Re-hook',             '"2… 1… What if I said… it''s none of those?" → "Everything you''ve been chasing — the perfect job, relationship, apartment — might just be a distraction from something far simpler."'),
  (4, 21,28, 'Payoff setup',        '"You''re not actually chasing those things themselves… you''re chasing the feeling you think they''ll give you."'),
  (5, 28,30, 'CTA',                 '"Watch the full video — I think it might change how you see life."')
) as v(sort_order, t0, t1, label, text)
where s.name = 'Purpose — 30s cut'
  and not exists (select 1 from script_beats b where b.script_id = s.id);

-- SCRIPT-06 beats -----------------------------------------------------------
insert into script_beats (script_id, sort_order, t_start_sec, t_end_sec, function_label, text)
select s.id, v.sort_order, v.t0, v.t1, v.label, v.text
from scripts s
cross join (values
  (1, 0, 3,  'Hook',            '"But what if I fail? What if I choose wrong? What if I waste time?" Sound familiar?'),
  (2, 3, 8,  'Re-hook',         '"Those thoughts feel like they''re protecting you… but they''re the very thing holding you back."'),
  (3, 8, 15, 'Pivot',           'Marcus Aurelius: "What stands in the way becomes the way." → "Obstacles aren''t stopping you from your purpose — they *are* your purpose."'),
  (4, 15,25, 'Story',           '"In the concentration camps, Viktor Frankl had zero control over his circumstances… but he *chose* his attitude. He found meaning in helping others — in the worst possible situation."'),
  (5, 25,35, 'Emotional spike', '"So maybe you won''t choose wrong. Because there is no wrong path — just different teachers."'),
  (6, 35,42, 'Payoff',          '"Every ''failure'' shows you what truly matters to you. Every setback builds who you''re becoming."'),
  (7, 42,45, 'CTA',             '"Still scared of failing? Good."')
) as v(sort_order, t0, t1, label, text)
where s.name = 'Fear of Failing — 45s'
  and not exists (select 1 from script_beats b where b.script_id = s.id);

-- SCRIPT-07 beats -----------------------------------------------------------
insert into script_beats (script_id, sort_order, t_start_sec, t_end_sec, function_label, text)
select s.id, v.sort_order, v.t0, v.t1, v.label, v.text
from scripts s
cross join (values
  (1, 0, 3,  'Hook',             '"You''re not lost. You''re just waiting… for a solution that''s never gonna arrive on its own."'),
  (2, 3, 7,  'Pattern interrupt','"We act like purpose is some hidden treasure/destination. It''s not. It''s in what you do next. Right now."'),
  (3, 7, 12, 'Re-hook',          '"Marcus Aurelius asked it best: what comes naturally to you that others struggle with?"'),
  (4, 12,18, 'Value stack',      '"Who do you want to do it for? What do people actually need?" → "Where those answers overlap — your path begins to appear."'),
  (5, 18,23, 'Shift',            '"You don''t need more research. You don''t need the perfect plan. You need to move."'),
  (6, 23,28, 'Payoff',           '"Because purpose doesn''t appear before action — it''s born from it. You act, you learn, you grow."'),
  (7, 28,30, 'CTA',              '"Follow if you''re done waiting, ready to build your own purpose this year."')
) as v(sort_order, t0, t1, label, text)
where s.name = 'Not Lost, Waiting — 30s'
  and not exists (select 1 from script_beats b where b.script_id = s.id);

-- The standalone shorts (SCRIPT-01/02/03) as their own videos ---------------
insert into videos (title, is_mine, status, lego_topic, notes)
select v.title, true, 'scripting', v.topic, v.notes
from (values
  ('Finger Independence','Finger independence / musicianship', null),
  ('AI Artists','AI in the music industry',
   'Unsourced stats flagged in the source: the 28,000 tracks/day figure, the 60% figure, and the signatory list. Verify before publishing.'),
  ('Imperfect Rhymes','Imperfect rhyming technique', null)
) as v(title, topic, notes)
where not exists (select 1 from videos x where x.title = v.title and x.is_mine);

insert into scripts (video_id, name, format, duration_target_sec)
select v.id, 'Short draft', 'short', 60
from videos v
where v.is_mine and v.title in ('Finger Independence','AI Artists','Imperfect Rhymes')
  and not exists (select 1 from scripts s where s.video_id = v.id);

insert into script_beats (script_id, sort_order, function_label, text)
select s.id, 1, 'Full script (single block — split into beats when you work on it)', v.text
from scripts s
join videos vid on vid.id = s.video_id
join (values
  ('Finger Independence', $b$This is a middle finger, indicator, and uhh ring… can you lift your ring finger without moving the others? 1% of people can't, but can you learn it? In a week? Why do you care? If you play guitar, piano, or spin a pencil with your fingers — well, this would be a game changer. But here comes the trick. It has been a week. I tried and did many finger exercises with the guitar and piano, and the result makes me feel I will never be able to be a good guitarist. And I found out my pinky is also uncontrollable. But I believe it is a skill to be mastered — or do you think it's a rare genetic? (leave it in the comments)$b$),
  ('AI Artists', $b$AI is a growing nightmare!? It's just a matter of days until music like this is mainstream. How good does it really sound? You tell me. But here is the thing — what will happen with the music industry? Artists like Billie Eilish, Pearl Jam, Stevie Wonder, and Norah Jones signed a letter through the Artist Rights Alliance condemning AI as an "assault on human creativity." 28,000 AI tracks are uploaded daily already! Some say music will become unique to each individual making their own sounds. Some say real artists will become antique and prioritized after all. Some say nearly 60% of artists are already secretly using AI tools despite public opposition. It's impossible to predict the future, so tell me what you think in the comments.$b$),
  ('Imperfect Rhymes', $b$Professional songs don't rhyme? You rarely ever see a song with perfect rhymes — that's why RhymeZone doesn't work, until I tell you this secret (at the end of the video). Off-the-charts catchy songs often have a technique called imperfect rhyming. This tension makes songs more engaging and helps storytelling. They sound more natural and conversational. What are the tricks? Swap the consonant following the vowel for another in the same family. Focus only on vowel sounds, ignoring everything else. And others which you can see in my full video. Here is the tip I promised: you can unlock unpredictable patterns using the new words to unlock more paths — search what rhymes with what you wrote based on the *stressed vowel sound*.$b$)
) as v(title, text) on v.title = vid.title
where not exists (select 1 from script_beats b where b.script_id = s.id);
