import Link from "next/link";
import { db } from "@/lib/db";
import { createCollection } from "./actions";
import { CATEGORIES } from "./categories";

export const dynamic = "force-dynamic";

const input =
  "w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm outline-none placeholder:text-ink-faint focus:border-accent-dim";

export default async function CollectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: reportedError } = await searchParams;
  const [collectionsResult, membershipsResult] = await Promise.all([
    db.from("collections").select("id, name, description, category, created_at").order("created_at", { ascending: false }),
    db.from("collection_videos").select("collection_id"),
  ]);

  const loadError = collectionsResult.error ?? membershipsResult.error;
  if (loadError) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <h1 className="text-lg text-ink">Can&apos;t reach the database</h1>
        <p className="mt-2 text-sm text-ink-dim">{loadError.message}</p>
      </div>
    );
  }

  const counts = new Map<string, number>();
  for (const entry of membershipsResult.data ?? []) {
    counts.set(entry.collection_id, (counts.get(entry.collection_id) ?? 0) + 1);
  }
  const collections = collectionsResult.data ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-6">
        <h1 className="text-xl font-medium tracking-tight text-ink">Collections</h1>
        <p className="mt-1.5 text-sm text-ink-dim">
          Reference videos from YouTube, TikTok and Instagram, grouped by what you want to learn from them.
        </p>
      </header>

      {reportedError && (
        <p role="alert" className="mb-4 rounded-lg border border-accent-dim px-3 py-2 text-sm text-accent">
          {reportedError}
        </p>
      )}

      <form action={createCollection} className="space-y-2 rounded-lg border border-border bg-surface p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_12rem]">
          <input required maxLength={100} name="name" autoComplete="off" placeholder="Collection name, e.g. curiosity visual hooks" className={input} />
          <select name="category" defaultValue="visual_hook" className={input}>
            {Object.entries(CATEGORIES).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <input name="description" maxLength={500} placeholder="What makes these worth studying? (optional)" className={input} />
        <button
          type="submit"
          className="rounded-md border border-accent-dim px-2.5 py-1 text-xs text-accent hover:bg-accent-dim/15"
        >
          Create collection
        </button>
      </form>

      <section className="mt-8">
        <div className="mb-2 flex items-baseline justify-between border-b border-border-soft pb-2">
          <h2 className="text-sm font-medium text-ink">Your collections</h2>
          <span className="text-[11px] text-ink-faint">{collections.length}</span>
        </div>

        {collections.length === 0 ? (
          <p className="py-6 text-sm text-ink-faint">Nothing yet. Create one above, then paste links into it.</p>
        ) : (
          <ul className="divide-y divide-border-soft">
            {collections.map((c) => (
              <li key={c.id}>
                <Link href={`/collections/${c.id}`} className="flex items-center gap-3 py-3 transition-colors hover:text-ink">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink-dim">{c.name}</span>
                    {c.description && <span className="block truncate text-[11px] text-ink-faint">{c.description}</span>}
                  </span>
                  <span className="shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-ink-faint">
                    {CATEGORIES[c.category] ?? c.category}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-ink-faint">{counts.get(c.id) ?? 0}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
