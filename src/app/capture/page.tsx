import { db } from "@/lib/db";
import { CaptureForm } from "./capture-form";
import { dropIdea } from "./actions";
import { promoteIdea } from "../videos/actions";

export const dynamic = "force-dynamic";

export default async function CapturePage() {
  const { data: ideas, error } = await db
    .from("ideas")
    .select("id, title, niche, status, created_at")
    .neq("status", "dropped")
    .order("created_at", { ascending: false })
    .limit(60);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-5">
        <h1 className="text-xl font-medium tracking-tight text-ink">Capture</h1>
        <p className="mt-1.5 text-sm text-ink-dim">
          A thought is enough. Everything else can be filled in later, or never.
        </p>
      </header>

      <CaptureForm />

      {error ? (
        <p className="mt-8 text-sm text-ink-dim">{error.message}</p>
      ) : (
        <>
          <div className="mt-8 mb-2 flex items-baseline justify-between border-b border-border-soft pb-2">
            <h2 className="text-sm font-medium text-ink">Bank</h2>
            <span className="text-[11px] text-ink-faint">{ideas?.length ?? 0} open</span>
          </div>

          <ul className="divide-y divide-border-soft">
            {(ideas ?? []).map((idea) => (
              <li key={idea.id} className="group flex items-start gap-3 py-2.5">
                <span className="min-w-0 flex-1 text-sm text-ink-dim">{idea.title}</span>
                {idea.niche && (
                  <span className="shrink-0 font-mono text-[10px] text-ink-faint">
                    {idea.niche}
                  </span>
                )}
                {/* Promotion is one tap: the idea becomes a video preloaded
                    with the default slot template, and the idea row keeps the
                    link so the bank still shows where it went. */}
                <form action={promoteIdea} className="shrink-0">
                  <input type="hidden" name="idea_id" value={idea.id} />
                  <button
                    type="submit"
                    aria-label={`Build "${idea.title}"`}
                    className="text-xs text-transparent transition-colors group-hover:text-ink-faint hover:!text-accent"
                  >
                    build
                  </button>
                </form>
                <form action={dropIdea} className="shrink-0">
                  <input type="hidden" name="id" value={idea.id} />
                  <button
                    type="submit"
                    aria-label={`Drop "${idea.title}"`}
                    className="text-xs text-transparent transition-colors group-hover:text-ink-faint hover:!text-accent"
                  >
                    drop
                  </button>
                </form>
              </li>
            ))}
          </ul>

          {(ideas?.length ?? 0) === 0 && (
            <p className="py-8 text-center text-sm text-ink-faint">Nothing captured yet.</p>
          )}
        </>
      )}
    </div>
  );
}
