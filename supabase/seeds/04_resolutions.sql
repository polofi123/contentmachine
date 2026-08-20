-- ===========================================================================
-- Resolutions — decisions made where two sources disagreed.
--
-- These are recorded here rather than by editing seed.sql, so the original
-- canvas stays an accurate record of what was extracted and this file stays an
-- accurate record of what was decided since.
--
-- Every statement is guarded on the text it expects to find, which makes it
-- both idempotent and safe: once applied the guard no longer matches, and if
-- you have edited the row yourself your version stands.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Speed to Value: 4 seconds, not 7–10.
--
-- SCR-04 (original canvas) said first value by 7–10s short / 45–60s long.
-- SCR-07 (complete_short_form_hook_system.md) says ~4s short / 1–2min long.
-- Decision: the tighter, more recent numbers win. SCR-04 is archived rather
-- than deleted — archiving is how this system retires a component, so anything
-- that ever referenced it keeps resolving.
-- ---------------------------------------------------------------------------
update components
set archived_at = coalesce(archived_at, now()),
    body = body || $b$

---

⚠️ **Superseded by SCR-07.** These timings were replaced by the tighter numbers
(~4s short form, 1–2 min long form) from the complete hook system. Archived, not
deleted, so anything that referenced it still resolves. Unarchive if you want it
back.$b$
where source_id = 'SCR-04'
  and body not like '%Superseded by SCR-07%';

-- SCR-07 is now the only live answer, so it no longer needs to argue with
-- anything. The conflict note comes out and the qualifier leaves the name.
update components
set name = 'Speed to Value',
    body = $b$Give the viewer something useful as early as possible. **Value at the TOP.**

| Format | First value by |
|---|---|
| Short form | **~4 seconds** |
| Long form / YouTube | **1–2 minutes** |

Better structure:
```
HOOK → USEFUL INSIGHT → CONTEXT → USEFUL INSIGHT → EXPLANATION → NEXT USEFUL INSIGHT
```

Think in repeated loops: `CONTEXT → VALUE → CONTEXT → VALUE → CONTEXT → VALUE`

*Supersedes SCR-04, which recorded 7–10s / 45–60s and is now archived.*$b$
where source_id = 'SCR-07'
  and body like '%conflicts with SCR-04%';
