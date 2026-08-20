-- ===========================================================================
-- Short-Form Lego Bricks — 20 Formats and 31 Visual Layouts.
--
-- Source: short_form_lego_bricks.md. This is the list the "Formats & Visual
-- Layouts Databases" PDF pointed at behind a Figma link and a paid signup.
--
-- Idempotent, like every seed here: ON CONFLICT (source_id) DO NOTHING, so
-- renaming or rewriting any of these in the library survives a re-run.
-- ===========================================================================

insert into layers (id, label, prefix, description, sort_order) values
  ('format',        'Formats',        'FMT',  'What kind of video this is. The starting point determines the whole build.', 45),
  ('visual_layout', 'Visual Layouts', 'VL',   'How the frame is composed and shot.',                                        46)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Category parents, so the library shows the same grouping as the source.
-- ---------------------------------------------------------------------------
insert into components (source_id, layer_id, name, body, url, sort_order, is_seeded) values
  ('FMT-EDU','format','Educational', $b$Formats built to teach, explain, or compare. Twelve of the twenty.$b$,
   'https://www.figma.com/board/xDzw2Ix07R7xDUcKluhT11/Short-Form-Lego-Bricks?node-id=828-368&p=f', 1, true),
  ('FMT-STORY','format','Storytelling', $b$Formats built around a narrative arc rather than an explanation.$b$, null, 2, true),

  ('VL-STUDIO','visual_layout','Studio / Set', $b$Fixed location, controlled frame.$b$,
   'https://www.figma.com/board/xDzw2Ix07R7xDUcKluhT11/Short-Form-Lego-Bricks?node-id=286-756&p=f', 1, true),
  ('VL-GREEN','visual_layout','Greenscreen', $b$Creator keyed over other visuals.$b$, null, 2, true),
  ('VL-FACELESS','visual_layout','Faceless', $b$No creator on camera.$b$, null, 3, true),
  ('VL-VLOG','visual_layout','In-World (Vlog)', $b$Real-world environment, background changes through the video.$b$, null, 4, true),
  ('VL-SKIT','visual_layout','In-World (Skit)', $b$Changing real-world background, staged as a skit.$b$, null, 5, true),
  ('VL-OTHER','visual_layout','Other', $b$Everything that isn't shot as continuous video.$b$, null, 6, true)
on conflict (source_id) do nothing;

-- ---------------------------------------------------------------------------
-- 20 Formats. `body` holds the Starting Point, because that is the field that
-- actually tells you whether you have the raw material for this format yet.
-- ---------------------------------------------------------------------------
insert into components (source_id, layer_id, name, body, parent_id, sort_order, is_seeded)
select v.source_id, 'format', v.name, 'Starting point: ' || v.start,
       (select id from components where source_id = v.parent), v.sort_order, true
from (values
  ('FMT-01','Breakdowns / Explainers',      'a topic, concept, or event you want to explain.',                       'FMT-EDU',   1),
  ('FMT-02','Case Studies',                 'an example of success you want to break down.',                         'FMT-EDU',   2),
  ('FMT-03','Problem / Solution',           'a problem you want to solve.',                                          'FMT-EDU',   3),
  ('FMT-04','Common Trap / Mistake',        'a common trap or mistake you want to help the viewer avoid.',           'FMT-EDU',   4),
  ('FMT-05','Tutorial',                     'a skill or process you want to break down into steps.',                 'FMT-EDU',   5),
  ('FMT-06','Listicle',                     'a list of options for accomplishing a task or solving a problem.',      'FMT-EDU',   6),
  ('FMT-07','Scenarios',                    'a hypothetical scenario you want to explore.',                          'FMT-EDU',   7),
  ('FMT-08','A vs. B (vs. C) Comparison',   'two or more options you want to compare against each other.',           'FMT-EDU',   8),
  ('FMT-09','Q&A',                          'a question you are going to answer.',                                   'FMT-EDU',   9),
  ('FMT-09b','Interview Clips',             'a question from the interviewer.',                                      'FMT-EDU',  10),
  ('FMT-10','Ranking / Rating / Tier List', 'a list of options you are comparing to each other.',                    'FMT-EDU',  11),
  ('FMT-11','Levels',                       'a set of options presented in ascending order.',                        'FMT-EDU',  12),
  ('FMT-12','Reaction',                     'a base video you are reacting to.',                                     'FMT-EDU',  13),
  ('FMT-13','Skit / Humor',                 'an entertaining or funny scenario.',                                    'FMT-STORY', 1),
  ('FMT-14','Hero''s Journey',              'a core problem that leads to a transformation arc.',                    'FMT-STORY', 2),
  ('FMT-15','Personal Learning / Epiphany', 'a core lesson or realization you want to share.',                       'FMT-STORY', 3),
  ('FMT-16','Day in the Life',              'a day''s worth of events.',                                             'FMT-STORY', 4),
  ('FMT-17','Personal Update',              'an update you want to share.',                                          'FMT-STORY', 5),
  ('FMT-18','About Me',                     'a background or origin story you want to tell.',                        'FMT-STORY', 6),
  ('FMT-19','Episodic Series / Social Show','the plot of an adventure or episode idea for the show.',                'FMT-STORY', 7),
  ('FMT-20','Challenge',                    'a challenge or desired objective you want to achieve.',                 'FMT-STORY', 8)
) as v(source_id, name, start, parent, sort_order)
on conflict (source_id) do nothing;

-- ---------------------------------------------------------------------------
-- 31 Visual Layouts.
-- ---------------------------------------------------------------------------
insert into components (source_id, layer_id, name, body, parent_id, sort_order, is_seeded)
select v.source_id, 'visual_layout', v.name, 'Starting point: ' || v.start,
       (select id from components where source_id = v.parent), v.sort_order, true
from (values
  ('VL-01','Full Screen / Hybrid',                'full-screen A-roll take in a studio, cutting back and forth between that and full-screen B-roll.', 'VL-STUDIO', 1),
  ('VL-02','Split Screen',                        'the frame is divided top/bottom or left/right — one side a product or software demo, the other you reacting or narrating.', 'VL-STUDIO', 2),
  ('VL-03','Whiteboard',                          'full-screen A-roll with a whiteboard behind you, used to explain the concept.', 'VL-STUDIO', 3),
  ('VL-04','Comparison / Clone',                  'the layout portrays two versions of the subject doing different things.', 'VL-STUDIO', 4),
  ('VL-05','Office / Room Yap',                   'full-screen video of you talking to camera with no additional visuals.', 'VL-STUDIO', 5),
  ('VL-06','Car Yap',                             'talking-head commentary filmed from inside a car.', 'VL-STUDIO', 6),
  ('VL-07','Podcast Clips',                       'a real or staged podcast conversation.', 'VL-STUDIO', 7),
  ('VL-08','Visual Greenscreen',                  'greenscreen removes your background and overlays you on images, videos, or screen recordings.', 'VL-GREEN', 1),
  ('VL-09','Notes / Article Greenscreen',         'a screenshot of Apple Notes, an article, or similar text fills most of the screen while you narrate the bullets.', 'VL-GREEN', 2),
  ('VL-10','Reaction (Greenscreen)',              'you react to content such as videos or music.', 'VL-GREEN', 3),
  ('VL-11','Faceless Reaction Explainer',         'B-roll clips from other accounts provide the hook, then transition into a spoken explainer.', 'VL-FACELESS', 1),
  ('VL-12','Faceless Physical Explainer',         'B-roll where you use graphics or words printed physically on paper or props.', 'VL-FACELESS', 2),
  ('VL-13','Faceless Clipping (Movie / TV / Podcast)', 'B-roll clips from movies, TV shows, podcasts, and interviews.', 'VL-FACELESS', 3),
  ('VL-14','Faceless Visual Explainer',           'visuals you create yourself or generate with AI.', 'VL-FACELESS', 4),
  ('VL-15','Faceless Gameplay Narration',         'dynamic gameplay footage (Minecraft, Subway Surfers) under voiceover and text overlays.', 'VL-FACELESS', 5),
  ('VL-16','Faceless Text Conversation',          'a story told through on-screen text messages between two or more parties.', 'VL-FACELESS', 6),
  ('VL-17','Faceless Animation',                  'full-screen animated graphics or visuals with narration.', 'VL-FACELESS', 7),
  ('VL-18','Vlog Reflective (Voiceover Only)',    'clips filmed in the real world without spoken audio, voiceover added in the edit.', 'VL-VLOG', 1),
  ('VL-19','Vlog Interactive (Direct Only)',      'clips filmed while talking directly to camera, stitched together into a story.', 'VL-VLOG', 2),
  ('VL-20','Vlog Hybrid (Direct + Voiceover)',    'clips where you speak to camera combined with voiceover segments.', 'VL-VLOG', 3),
  ('VL-21','Vlog Music (No Spoken Audio)',        'real-world clips with no speech, carried by background music.', 'VL-VLOG', 4),
  ('VL-22','Vlog POV (No Spoken Audio)',          'shot from your own viewpoint, as if the audience sees through your eyes.', 'VL-VLOG', 5),
  ('VL-23','Vlog Timelapse',                      'a lengthy task or transformation shown start to finish, sped up.', 'VL-VLOG', 6),
  ('VL-24','Man on the Street (Single)',          'interview one person on the street; interviewer can be behind or in front of camera.', 'VL-VLOG', 7),
  ('VL-25','Man on the Street (Multiple)',        'interview several people and cut quickly between responses.', 'VL-VLOG', 8),
  ('VL-26','Skit (Group)',                        'a skit or scene with multiple characters.', 'VL-SKIT', 1),
  ('VL-27','Skit (Solo)',                         'a skit or scene featuring multiple versions of yourself.', 'VL-SKIT', 2),
  ('VL-28','Skit (Lip-Sync)',                     'a skit or scene performed lip-syncing to audio.', 'VL-SKIT', 3),
  ('VL-29','Skit (Transformation Reveal)',        'a skit or scene built around a transformation reveal.', 'VL-SKIT', 4),
  ('VL-30','Static Image / Slideshow',            'a series of still images shown in sequence, often with text overlays explaining each point.', 'VL-OTHER', 1),
  ('VL-31','Stop-Motion',                         'still photos or minimally adjusted frames stitched together so objects appear to move by themselves.', 'VL-OTHER', 2)
) as v(source_id, name, start, parent, sort_order)
on conflict (source_id) do nothing;
