-- ===========================================================================
-- Top 10 Storytelling Formats + the Addictive Storytelling Formula.
-- Sources: top_10_storytelling_formats.md, addictive-storytelling-formula.md
-- ===========================================================================

insert into layers (id, label, prefix, description, sort_order) values
  ('story_format', 'Story Formats', 'SFMT', 'Narrative shapes, all first-person unless noted. Each carries plug-and-play templates.', 55),
  ('story_loop',   'Story Loop',    'LOOP', 'The repeating engine that keeps a viewer predicting what happens next.',              56)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The addictive storytelling loop: STAKES → BIG QUESTION → HEAD FAKE → REHOOK
-- ---------------------------------------------------------------------------
insert into components (source_id, layer_id, name, body, sort_order, is_seeded) values
  ('LOOP-00','story_loop','The Core Loop', $b$**STAKES → BIG QUESTION → HEAD FAKE → REHOOK → repeat**

The goal is to always keep the viewer **predicting what happens next**.

Simple version:
> **CARE → QUESTION → PREDICT → SURPRISE → NEW QUESTION**

- **Care** — give me a reason to care.
- **Question** — give me something I need answered.
- **Predict** — give me enough clues to guess.
- **Surprise** — prove my prediction wrong, logically.
- **New question** — before my attention drops, make me wonder about something else.

**One-line writing template:**
`[Character + Stakes + Urgency] → [Specific unresolved problem] → let viewer predict → [logical unexpected reveal] → "which would've been great, except…" → next problem → repeat.`$b$, 0, true),

  ('LOOP-01','story_loop','1. Stakes', $b$**Character + Something at Risk + Urgency**

- **WHO** is this happening to?
- **WHAT** could they lose?
- **WHY does it matter right now?**

`[Person] has [time limit] to accomplish [goal], or [consequence].`

> I had 48 hours to figure out why our paid ads weren't working or we were going to burn through the entire budget.

> The prince's kingdom is dying from a plague. The cure is inside a tower guarded by a dragon, and if he doesn't retrieve it within a week, everyone he loves will die.$b$, 1, true),

  ('LOOP-02','story_loop','2. Big Question', $b$Give the viewer **enough information to make a prediction — but not enough to know the answer.** They should automatically think *"so what's going to happen?"*

`[Situation/setup]… but then [specific unknown/problem].`
`[Important thing happens], which leaves one obvious question: [question].`

> I get on a call with my client, and within 30 minutes she tells me something that completely changes my strategy for the next six months.

**Bad version:** "I had a call with a client and it went well." — there is nothing to predict.$b$, 2, true),

  ('LOOP-03','story_loop','3. Head Fake', $b$**Expected result → unexpected result that still makes sense.**

First ask what the viewer currently thinks will happen. Then give them something different, but logically connected to everything already shown.

`Everything suggested [expected outcome]. But instead, [unexpected reveal].`

*Expectation:* the prince has to fight the dragon.
*Reveal:* the dragon isn't guarding the tower — it's chained to it. It's a prisoner. He frees it instead.

**The rule:** a good head fake makes the viewer think *"ohhhh, that makes sense"* — not *"where did that come from?"*

**Surprising + logical = good. Surprising + random = bad.**$b$, 3, true),

  ('LOOP-04','story_loop','4. Rehook', $b$**Close one question while simultaneously opening another.**

Don't do: `answer → pause → transition → new problem.`
Do: `answer → BUT/EXCEPT/THEN → new problem.`

`[Resolution], which would have been great except [new complication].`

Connectors: *But here's the problem… · Except… · And that's when I realized… · Which is exactly why… · But then… · That's when things got worse…*

> She told me she was doubling her budget, **which would've been amazing if I hadn't signed an exclusivity agreement with her competitor the night before.**

Loop 1 closes (what did the client say?) as loop 2 opens (what happens now?).$b$, 4, true),

  ('LOOP-05','story_loop','Worked examples', $b$**Creator** — *Stakes:* my biggest video of the month was supposed to go live Friday, but two days before posting the sponsor told me they hated it. *Big question:* changing what they wanted would've meant reshooting almost the entire video. *Head fake:* the analytics showed the sponsor wasn't the problem — their changes would've fixed the exact point where viewers clicked away. *Rehook:* which would've solved everything — except the video was scheduled to publish in six hours.

**Business** — *Stakes:* we'd spent $40,000 on ads with three days left. *Big question:* sales were coming in but we were losing money on almost every customer. *Prediction:* the ads suck. *Head fake:* the ads were profitable — the checkout page was giving free shipping twice. *Rehook:* fixing it should've solved it, except conversions immediately dropped 30%.

**Personal** — *Stakes:* six months building an app, launching Monday. *Big question:* the night before, one tester found something in five minutes I'd missed in six months. *Prediction:* massive bug. *Head fake:* the app worked perfectly — he had no idea what it was supposed to do. *Rehook:* so I redesigned the homepage that night, and that's when I found the much bigger problem.$b$, 5, true)
on conflict (source_id) do nothing;

-- ---------------------------------------------------------------------------
-- 10 storytelling formats.
-- ---------------------------------------------------------------------------
insert into components (source_id, layer_id, name, body, sort_order, is_seeded)
select v.source_id, 'story_format', v.name, v.body, v.sort_order, true
from (values
  ('SFMT-01','Hero''s Journey', $b$*1st person POV problem / solution.* A first-person transformation arc where you solve a problem or overcome a challenge.

**Starting point:** a core problem leading to a transformation arc.

**Strategy:** hook → establish character and problem → failed attempts (exaggerate the problem) → novel solution → why it worked and what success looked like → optional CTA.

**Secret sauce:** the viewer needs to emotionally relate to your pain. If they feel the problem with you, they become invested in how you solved it.

**Templates**
1. *Intro* — "X days/years ago I [problem]." / "I was a [role] struggling with [problem], and I had no idea how to fix it."
2. *Inflection* — "Because of this I was [pain points]." / "It got so bad that I [lowest moment]."
3. *Rising action* — "I tried [failed #1], [failed #2], [failed #3] — nothing worked."
4. *Climax* — "Finally, after [X] of no results, I figured out the one thing that actually worked: [solution]."
5. *Falling action* — "When I started doing this I [results]." / "Within [timeframe] I went from [before] to [after]."
6. *Resolution* — "Now I help [audience] go from [pain] to [dream result]. [CTA]."

**Examples:** instagram.com/reel/DFMknzvye8Q · instagram.com/p/C84meBcM9NB (no talking: instagram.com/p/C-IOTqUtbth)$b$, 1),

  ('SFMT-02','Personal Learning / Epiphany', $b$*1st person POV insight.* Frame a personal victory, then teach how it was achieved. Lead with proof before teaching.

**Starting point:** a core learning you want to share.

**Strategy:** hook → establish the result with proof → the process → optional: why this differs from common advice → optional CTA.

**Secret sauce:** use extremely strong visible proof, especially screenshots, to create a *"how did they do that?"* gap. The solution must feel non-obvious, or viewers dismiss the result as an outlier they can't replicate.

**Templates**
1. *Hook, lead with proof* — "I [result] in just [timeframe] — here's exactly how." / "[Screenshot]. Everyone keeps asking me how I did this."
2. *Backstory* — "For [X] I was stuck at [plateau] because I was doing [wrong approach]."
3. *The insight* — "Then I realized [realization] — and that's what changed everything." / "The mistake I was making was [mistake]. The fix was [fix]."
4. *Breakdown* — "So here's exactly what I did: first [1], then [2], and finally [3]."
5. *CTA* — "If you want the full breakdown, [CTA]."$b$, 2),

  ('SFMT-03','About Me', $b$*Origin story.* Your backstory explaining the "why" behind the brand or mission.

**Starting point:** a background or origin story you want to tell.

**Strategy:** hook → context about normal life → epiphany or change moment → how that changed your path → optional CTA.

**Secret sauce:** good to pin to a profile. Its job is personal connection and trust, not professional authority.

**Templates**
1. *Intro* — "Hi, I'm [name], and [X] ago I was a normal person working as a [role]."
2. *Conflict* — "All up until [life-changing event]." / "Then one day [trigger] happened and I couldn't ignore it."
3. *Epiphany* — "Because of this I realized [epiphany]."
4. *Change* — "Which led me to [action], and that leads me to today."
5. *Purpose* — "Now everything I do is about helping [who] achieve [what] without [common pain]."$b$, 3),

  ('SFMT-04','Before and After', $b$*Transformation reveal.* Organized around the contrast between two states. Visual, and it lives or dies on the size of the gap.

**Starting point:** two contrasting states you want to showcase.

**Strategy:** hook → establish the before → brief tension → reveal the after → optional context on time/effort → optional CTA.

**Secret sauce:** the bigger and more surprising the gap, the stronger the watch time, saves and shares. **The transition is the emotional peak** — sync it to a beat drop or strong visual cue. Keep it short; the strongest versions are often **15–30 seconds**.

**Templates**
1. *Hook* — "[X months/years] of [effort] in [X seconds]." / "Watch this transformation."
2. *Before* — "This is where I started: [before]." Or no words; let the visual speak.
3. *Transition* — no script. Sync to a beat drop, snap, clap, or visual cue.
4. *After* — "And this is [subject] now."
5. *Context* — "[X months] of [effort]. Worth every second."$b$, 4),

  ('SFMT-05','Goal / Dream Journey', $b$A long-held dream or ambitious goal, and where you currently are on the path.

Unlike a challenge — which has defined rules and a bounded timeframe — this is **ongoing and open-ended**. The audience is invited to follow along.

**Starting point:** a long-term dream you're pursuing.

**Strategy:** hook → introduce the dream and why it matters → the moment you decided to seriously pursue it → progress update → what's next → CTA inviting them to follow.

**Secret sauce:** the dream should be ambitious enough that the audience genuinely wonders whether you'll make it. Share vulnerable moments about whether you will. The best versions feel personal rather than like a project announcement.

**Templates**
1. "Ever since I was [age] I've always dreamed of [dream]."
2. "After years of dreaming, on one random [weekday] I [realization] and decided it was now or never."
3. "So far I've [progress], and now I'm about to [next step]. To hit [dream] by [date] I need to finish this in [timeframe]."
4. "Follow along and hold me accountable."$b$, 5),

  ('SFMT-06','Challenge', $b$A mission you've completed or are completing. A vlog crossed with a DIY format, centred on a specific mission.

**Starting point:** a challenge or mission you want to complete.

**Strategy:** hook → establish the challenge context → plot arc around conflicts and obstacles → resolution or cliffhanger.

**Secret sauce:** make the objective extremely ambitious, and add high-intensity complications.

**Templates**
1. *Hook* — "I'm going to [challenge] in [timeframe]. Here's what happened." / "I gave myself [X days] to [challenge]. No shortcuts."
2. *Rules* — "The rules: [1], [2], [3]." / "Starting point: [baseline]. Goal: [target]. Deadline: [date]."
3. *Journey* — "Day [X]: [setback]." / "Then [complication] happened and I had to [pivot]."
4. *Resolution* — "Final result: [outcome]." / "And with [X hours] left… [cliffhanger]. Follow for part 2."$b$, 6),

  ('SFMT-07','Win', $b$*Victory announcement.* Celebrate a specific achievement with proof.

The distinction: **Personal Learning** teaches backward from a result · **Personal Update** shares general news · **Win** announces and celebrates.

**Starting point:** a specific achievement or milestone.

**Strategy:** hook → state the win with proof → brief emotional context → optional acknowledgment of the journey → optional CTA.

**Secret sauce:** wins perform best when the proof is undeniable and visual. Keep the delivery short, spontaneous and raw.

**Templates**
1. "It finally happened: [win]." / "We just [achievement] and I'm still in shock."
2. "Here's the screenshot: [proof]. [X] ago this number was [old number]."
3. "You have no idea how long I've worked for this." / "I almost quit [when]. This is why I didn't."
4. "Next goal: [milestone]. Follow to watch."$b$, 7),

  ('SFMT-08','Day in the Life', $b$A day-in-the-life scenario from first-person POV.

**Starting point:** a day's worth of events.

**Strategy:** hook → context (character, scene, objective) → complication → how it gets solved → optional CTA.

**Secret sauce:** you're trying to make viewers like your personality or want the life you're showing. **Show something unexpected** — viewers should see something they don't expect you to do.

**Templates**
1. "A day in the life of a [age]-year-old [role]." / "This is what it actually looks like to [aspiration]."
2. "I start every day with [routine] because [reason]. Most people don't know I [unexpected detail]."
3. "Today's biggest priority is [task]. The challenge is [complication]."
4. "End of day. Here's what I got done: [summary]."$b$, 8),

  ('SFMT-09','Personal Update', $b$A personal update about your life or mission.

**Starting point:** an update you want to share.

**Strategy:** hook → context on you and the situation → the update, including tension or conflict → explain the decision → optional CTA.

**Secret sauce:** let viewers behind the curtain. Less about authority, more about community.

**Templates**
1. "I need to tell you something: [teaser]." / "I've been keeping this quiet for [X], but it's time."
2. "For the past [X] I've been [previous state]."
3. "As of [date], I'm [the change]. It wasn't easy because [tension]."
4. "I realized that [insight], and once I saw it I couldn't un-see it."$b$, 9),

  ('SFMT-10','Lesson From Others', $b$*Mentor story.* You tell someone else's story rather than your own — a mentor, client, peer, or public figure whose experience contains the lesson. **You become the narrator/student, not the hero.**

**Starting point:** someone else's story that taught you something valuable.

**Strategy:** hook → introduce the person and why they matter → describe their situation vividly → reveal the lesson → how you applied it and what changed → optional CTA.

**Secret sauce:** position yourself as a student and curator, not a self-promoter. Make the other person a real character the viewer can picture — name them, describe a specific situation. Make the lesson land as a memorable quote, not a generic takeaway.

**Templates**
1. "Here's the best advice [figure] ever gave me." / "[Person] told me one thing that completely changed how I [area]."
2. "At the time, they were [situation]."
3. "They told me: '[golden quote].'"
4. "I took that advice and [action]. Within [timeframe], I [outcome]."
5. "Who's the person that taught you the most? Comment below."$b$, 10)
) as v(source_id, name, body, sort_order)
on conflict (source_id) do nothing;

-- ---------------------------------------------------------------------------
-- Speed to value: the new source says ~4 seconds for short form, where the
-- original canvas (SCR-04) says 7–10. Both are recorded rather than one
-- silently replacing the other — you decide which you trust.
-- ---------------------------------------------------------------------------
insert into components (source_id, layer_id, name, body, sort_order, is_seeded) values
  ('SCR-07','script','Speed to Value (revised timings)', $b$Give the viewer something useful as early as possible.

- Short-form: roughly **4 seconds**
- YouTube / long-form: roughly **1–2 minutes**

> ⚠️ This **conflicts with SCR-04**, which records 7–10 seconds for short form and 45–60 for long. Both are kept deliberately; the tighter number is the more recent source. Pick one and archive the other rather than averaging them.

Better structure:
```
HOOK → USEFUL INSIGHT → CONTEXT → USEFUL INSIGHT → EXPLANATION → NEXT USEFUL INSIGHT
```

Think in repeated loops: `CONTEXT → VALUE → CONTEXT → VALUE → CONTEXT → VALUE`$b$, 7, true)
on conflict (source_id) do nothing;

-- ---------------------------------------------------------------------------
-- New workbench slots for the new layers. Not in the default template — add
-- them per build from the completeness panel when a video needs them.
-- ---------------------------------------------------------------------------
insert into slots (key, label, layer_id, description, in_default_template, sort_order) values
  ('format',        'Format',        'format',        'What kind of video this is (20 options).',              false, 15),
  ('visual_layout', 'Visual layout', 'visual_layout', 'How the frame is composed and shot (31 options).',      false, 35),
  ('visual_hook',   'Visual hook',   'visual_hook',   'What the first frame does (47 options).',               false, 22),
  ('spoken_hook',   'Spoken hook',   'spoken_hook',   'What the first line does (13 formats).',                false, 23),
  ('hook_modifier', 'Hook modifiers','hook_modifier', 'Stacked on top of the hook to make it harder to skip.', false, 24),
  ('story_format',  'Story format',  'story_format',  'The narrative shape, with plug-and-play templates.',    false, 45),
  ('story_loop',    'Story loop',    'story_loop',    'Stakes → big question → head fake → rehook.',           false, 46)
on conflict (key) do nothing;
