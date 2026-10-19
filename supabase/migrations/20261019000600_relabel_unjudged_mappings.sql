-- "AI-supported" now means a relevance check judged the quoted words to directly show the
-- component. Mappings saved before that check existed were relabelled 'ai_supported' by
-- 20261019000300 (they used to be called 'confirmed' by an earlier rule) but never passed
-- it, so they are uncertain under the current definition. Only the machine's label and its
-- reasons change; the evidence, explanation, confidence and every review are left as they were.
update public.component_mappings
   set ai_status = 'uncertain',
       uncertainty = uncertainty || '["Made before the relevance check existed: whether the quoted words directly show this was not checked. (An earlier version of the rules called this confirmed.)"]'::jsonb
 where ai_status = 'ai_supported'
   and not exists (select 1 from jsonb_array_elements(evidence) e where e ? 'relevance');
