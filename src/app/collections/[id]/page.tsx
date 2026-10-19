import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { outlierScore } from "@/lib/format";
import { deleteCollection } from "../actions";
import { CATEGORIES } from "../categories";
import { CollectionGrid, type CardVideo } from "./collection-grid";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CollectionDetailPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ id }, { error: reportedError }] = await Promise.all([params, searchParams]);
  // A malformed id would otherwise surface as a Postgres uuid cast error.
  if (!UUID.test(id)) notFound();

  const { data: collection, error: collectionError } = await db.from("collections")
    .select("id, name, description, category").eq("id", id).maybeSingle();
  if (collectionError) throw new Error(`Could not load collection: ${collectionError.message}`);
  if (!collection) notFound();

  // One query through the foreign keys rather than ids-then-.in(), which also
  // keeps a long collection from building an oversized URL. The latest views
  // come through video_latest_metrics, the same snapshot video_stats reads.
  const { data: membership, error: membershipError } = await db.from("collection_videos")
    .select(
      "video_id, added_at, note, videos(id, title, url, platform, channel_name, published_at, thumbnail_url, channel_avg_views, video_latest_metrics(views))",
    )
    .eq("collection_id", id)
    .order("added_at", { ascending: false });
  if (membershipError) throw new Error(`Could not load saved references: ${membershipError.message}`);

  const videos: CardVideo[] = (membership ?? []).flatMap(({ videos: v, added_at, note }) => {
    if (!v) return [];
    const views = v.video_latest_metrics[0]?.views ?? null;
    return [{
      id: v.id,
      title: v.title,
      url: v.url,
      platform: v.platform,
      channel: v.channel_name,
      publishedAt: v.published_at,
      addedAt: added_at,
      note,
      thumbnail: v.thumbnail_url,
      views,
      outlier: outlierScore(views, v.channel_avg_views),
    }];
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <Link href="/collections" className="text-[11px] text-ink-faint hover:text-ink-dim">← Collections</Link>
      <header className="mb-5 mt-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-medium tracking-tight text-ink">{collection.name}</h1>
          <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-ink-faint">
            {CATEGORIES[collection.category] ?? collection.category}
          </span>
        </div>
        {collection.description && <p className="mt-1.5 text-sm text-ink-dim">{collection.description}</p>}
      </header>

      {reportedError && (
        <p role="alert" className="mb-4 rounded-lg border border-accent-dim px-3 py-2 text-sm text-accent">
          {reportedError}
        </p>
      )}

      <CollectionGrid collectionId={collection.id} videos={videos} />

      <details className="mt-12 border-t border-border-soft pt-4 text-sm">
        <summary className="cursor-pointer text-[11px] text-ink-faint hover:text-ink-dim">Delete this collection…</summary>
        <div className="mt-3 rounded-lg border border-border bg-surface p-3">
          <p className="mb-3 text-[12px] text-ink-dim">
            Removes the collection and its links. The videos themselves, and anything you wrote on them, stay.
          </p>
          <form action={deleteCollection}>
            <input type="hidden" name="collection_id" value={collection.id} />
            <button
              type="submit"
              className="rounded-md border border-accent-dim px-2.5 py-1 text-xs text-accent hover:bg-accent-dim/15"
            >
              Delete collection
            </button>
          </form>
        </div>
      </details>
    </div>
  );
}
