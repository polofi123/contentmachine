import { db } from "@/lib/db";
import { ComponentCard, type ComponentRow } from "./component-card";
import { NewComponentForm } from "./new-component-form";

export const dynamic = "force-dynamic";

type Layer = {
  id: string;
  label: string;
  prefix: string;
  description: string | null;
  sort_order: number;
};

type Row = ComponentRow & { layer_id: string; parent_id: string | null; sort_order: number };

export default async function LibraryPage() {
  const [{ data: layers, error: layerErr }, { data: components, error: compErr }] =
    await Promise.all([
      db.from("layers").select("*").order("sort_order"),
      db
        .from("components")
        .select(
          "id, source_id, layer_id, parent_id, name, body, sort_order, is_seeded, is_placeholder, archived_at",
        )
        .order("sort_order"),
    ]);

  if (layerErr || compErr) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <h1 className="text-lg text-ink">Can&apos;t reach the database</h1>
        <p className="mt-2 text-sm text-ink-dim">{layerErr?.message ?? compErr?.message}</p>
        <p className="mt-4 text-sm text-ink-faint">
          Run <code className="font-mono text-accent">pnpm exec supabase start</code>, then copy the
          API URL and keys into <code className="font-mono">.env.local</code>.
        </p>
      </div>
    );
  }

  const all = (components ?? []) as Row[];

  // Nest children under their parents. CHK-01a..d sit under CHK-01,
  // HOOKW-01..06 under HOOK-02 — the library should show that shape.
  const byParent = new Map<string, Row[]>();
  for (const c of all) {
    if (!c.parent_id) continue;
    const list = byParent.get(c.parent_id) ?? [];
    list.push(c);
    byParent.set(c.parent_id, list);
  }

  const attach = (c: Row): ComponentRow => ({
    ...c,
    children: (byParent.get(c.id) ?? []).map(attach),
  });

  const roots = all.filter((c) => !c.parent_id).map(attach);
  const placeholderCount = all.filter((c) => c.is_placeholder).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8">
        <h1 className="text-xl font-medium tracking-tight text-ink">Library</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-ink-dim">
          Every element of the framework, as an editable record. Rename anything — re-seeding will
          not overwrite your edits.
        </p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-faint">
          <span>
            <span className="text-ink">{all.length}</span> components
          </span>
          <span>
            <span className="text-ink">{layers?.length ?? 0}</span> layers
          </span>
          {placeholderCount > 0 && (
            <span className="text-accent/80">
              {placeholderCount} exist in the source framework but were never named
            </span>
          )}
        </div>
      </header>

      <div className="space-y-10">
        {(layers ?? []).map((layer: Layer) => {
          const items = roots.filter((c) => (c as Row).layer_id === layer.id);
          return (
            <section key={layer.id} id={layer.id} className="scroll-mt-20">
              <div className="mb-3 flex items-baseline gap-2.5 border-b border-border-soft pb-2">
                <h2 className="text-sm font-medium text-ink">{layer.label}</h2>
                <span className="font-mono text-[10px] text-ink-faint">{layer.prefix}</span>
                <span className="ml-auto text-[11px] text-ink-faint">{items.length}</span>
              </div>
              {layer.description && (
                <p className="mb-3 text-xs text-ink-faint">{layer.description}</p>
              )}

              <div className="space-y-1.5">
                {items.map((c) => (
                  <ComponentCard key={c.id} c={c} />
                ))}
              </div>

              <NewComponentForm layerId={layer.id} layerLabel={layer.label} />
            </section>
          );
        })}
      </div>
    </div>
  );
}
