import { db } from "@/lib/db";
import { aiConfigured } from "@/lib/ai";
import { HookCaptureForm } from "./hook-capture-form";
import { HookRow, type WordType } from "./hook-row";
import { Prompts } from "./prompts";

export const dynamic = "force-dynamic";

/**
 * Pull the bullet lines out of a component body.
 *
 * The library stores prose, not lists, so this takes the `- ` lines and leaves
 * the rest. A body with no bullets yields nothing and the block hides itself,
 * which is the right outcome — better an absent panel than an empty one.
 */
function bullets(body: string | null | undefined): string[] {
  return (body ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2).trim())
    .filter(Boolean);
}

export default async function HooksPage() {
  const [{ data: hooks, error }, { data: wordTypes }, { data: checklist }] = await Promise.all([
    // The bank is `video_id is null` — the rows `hooks_bank_idx` was built for.
    db
      .from("hooks")
      .select("id, text")
      .is("video_id", null)
      .order("created_at", { ascending: false })
      .limit(80),
    db
      .from("components")
      .select("id, source_id, name")
      .like("source_id", "HOOKW-%")
      .is("archived_at", null)
      .order("source_id"),
    db.from("components").select("body").eq("source_id", "HOOK-16").maybeSingle(),
  ]);

  const ids = (hooks ?? []).map((h) => h.id);

  const { data: tagRows } = ids.length
    ? await db.from("hook_word_tags").select("hook_id, component_id").in("hook_id", ids)
    : { data: [] };

  const tags = new Map<string, string[]>();
  for (const row of tagRows ?? []) {
    tags.set(row.hook_id, [...(tags.get(row.hook_id) ?? []), row.component_id]);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-5">
        <h1 className="text-xl font-medium tracking-tight text-ink">Hooks</h1>
        <p className="mt-1.5 text-sm text-ink-dim">
          Loose lines, belonging to nothing yet. Write the bad ones — that is how the
          good one turns up.
        </p>
      </header>

      <HookCaptureForm />
      <Prompts items={bullets(checklist?.body)} />

      {error ? (
        <p className="mt-8 text-sm text-ink-dim">{error.message}</p>
      ) : (
        <>
          <div className="mt-8 mb-2 flex items-baseline justify-between border-b border-border-soft pb-2">
            <h2 className="text-sm font-medium text-ink">Bank</h2>
            <span className="text-[11px] text-ink-faint">{hooks?.length ?? 0} loose</span>
          </div>

          <ul className="divide-y divide-border-soft">
            {(hooks ?? []).map((h) => (
              <HookRow
                key={h.id}
                hook={h}
                wordTypes={(wordTypes ?? []) as WordType[]}
                tagged={tags.get(h.id) ?? []}
                aiOn={aiConfigured()}
              />
            ))}
          </ul>

          {(hooks?.length ?? 0) === 0 && (
            <p className="py-8 text-center text-sm text-ink-faint">Nothing in the bank yet.</p>
          )}
        </>
      )}
    </div>
  );
}
