-- A component about what is SEEN (visual_hook, visual_layout, edit) is never AI-supported: spoken words cannot
-- establish a visual technique and the picture evidence is an AI's unchecked description. Rows saved before that
-- rule can still say 'ai_supported'; only the machine's label and its reasons change. Evidence, explanation,
-- confidence and every review are left as they were.
update public.component_mappings m
   set ai_status = 'uncertain',
       uncertainty = uncertainty || '["This component is about what is seen or how it is edited. Spoken words cannot establish it, so it stays uncertain until a person who has watched the video reviews it. (Relabelled when this rule was introduced.)"]'::jsonb
  from public.components c
 where c.id = m.component_id
   and m.ai_status = 'ai_supported'
   and c.layer_id in ('visual_hook', 'visual_layout', 'edit');
