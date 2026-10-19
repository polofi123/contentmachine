"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { normalizeVideoUrl, splitLinks, thumbnailFor, videoKey, type VideoLink } from "@/lib/platform";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATEGORIES = new Set(["format", "visual_hook", "editing_style", "signature_series", "other"]);
const MAX_LINKS = 200;
const PLATFORM_LABEL = { youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram" } as const;

function string(form: FormData, field: string, max = 500): string {
  return String(form.get(field) ?? "").trim().slice(0, max);
}

function errorRedirect(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function createCollection(formData: FormData) {
  const name = string(formData, "name", 100);
  if (!name) errorRedirect("/collections", "Give your collection a name.");
  const categoryInput = string(formData, "category", 50);
  const category = CATEGORIES.has(categoryInput) ? categoryInput : "other";
  const description = string(formData, "description", 500);

  const { data, error } = await db
    .from("collections")
    .insert({ name, category, description })
    .select("id")
    .single();
  if (error || !data) errorRedirect("/collections", error?.message ?? "Could not create collection.");
  revalidatePath("/collections");
  redirect(`/collections/${data.id}`);
}

export type ImportResult = {
  added: number;
  /** Of `added`, how many were already a video row (logged outlier, another collection). */
  reused: number;
  skipped: { link: string; reason: string }[];
  error?: string;
};

// One link or two hundred go through the same path, so a single paste and a
// bulk paste cannot disagree about what counts as a duplicate.
//
// Duplicates are caught at three levels: twice in the same paste, already in
// this collection, and already a video anywhere in the app. The last is not a
// skip — the existing row is linked rather than copied, so a video saved to two
// collections stays one video with one set of Legos.
export async function importReferences(
  _prev: ImportResult | null,
  formData: FormData,
): Promise<ImportResult> {
  const collectionId = string(formData, "collection_id", 64);
  const fail = (error: string): ImportResult => ({ added: 0, reused: 0, skipped: [], error });
  if (!UUID.test(collectionId)) return fail("Invalid collection ID.");

  const links = splitLinks(String(formData.get("urls") ?? ""));
  if (links.length === 0) return fail("Paste at least one link.");
  if (links.length > MAX_LINKS) return fail(`That's ${links.length} links — import at most ${MAX_LINKS} at a time.`);
  const note = string(formData, "note", 2000);
  const title = string(formData, "title", 250);

  const { data: collection, error: collectionError } = await db
    .from("collections").select("id").eq("id", collectionId).maybeSingle();
  if (collectionError) return fail(collectionError.message);
  if (!collection) return fail("Collection not found.");

  const skipped: ImportResult["skipped"] = [];
  const wanted = new Map<string, VideoLink>();
  for (const link of links) {
    const parsed = normalizeVideoUrl(link);
    if (!parsed) skipped.push({ link, reason: "not a YouTube, TikTok or Instagram link" });
    else if (wanted.has(videoKey(parsed))) skipped.push({ link, reason: "duplicate in this paste" });
    else wanted.set(videoKey(parsed), parsed);
  }

  // Every video that has a URL or platform id, keyed both ways. Rows logged by
  // hand may carry a URL with no platform_video_id (or the wrong platform), so
  // the URL is re-parsed rather than trusting the stored columns alone. A
  // single-user local table — reading it whole is cheaper than being clever.
  const { data: rows, error: rowsError } = await db
    .from("videos")
    .select("id, url, platform, platform_video_id")
    .or("url.not.is.null,platform_video_id.not.is.null");
  if (rowsError) return fail(rowsError.message);
  const existing = new Map<string, string>();
  for (const row of rows ?? []) {
    const fromUrl = row.url ? normalizeVideoUrl(row.url) : null;
    if (fromUrl) existing.set(videoKey(fromUrl), row.id);
    if (row.platform && row.platform_video_id) existing.set(`${row.platform}:${row.platform_video_id}`, row.id);
  }

  const { data: members, error: membersError } = await db
    .from("collection_videos").select("video_id").eq("collection_id", collectionId);
  if (membersError) return fail(membersError.message);
  const inCollection = new Set((members ?? []).map((m) => m.video_id));

  const toLink: string[] = [];
  const toCreate: VideoLink[] = [];
  for (const [key, link] of wanted) {
    const id = existing.get(key);
    if (!id) toCreate.push(link);
    else if (inCollection.has(id)) skipped.push({ link: link.url, reason: "already in this collection" });
    else toLink.push(id);
  }
  const reused = toLink.length;

  let raced = 0;
  if (toCreate.length > 0) {
    // The unique (platform, platform_video_id) index decides races: a link that
    // another import inserted first is skipped by the insert, then looked up and
    // reused below instead of failing or creating a second row.
    const { data: created, error: createError } = await db
      .from("videos")
      .upsert(toCreate.map((link) => ({
        title: wanted.size === 1 && title
          ? title
          : `${PLATFORM_LABEL[link.platform]} reference${link.videoId ? ` · ${link.videoId}` : ""}`,
        url: link.url,
        is_mine: false,
        platform: link.platform,
        platform_video_id: link.videoId,
        thumbnail_url: thumbnailFor(link),
      })), { onConflict: "platform,platform_video_id", ignoreDuplicates: true })
      .select("id, platform, platform_video_id");
    if (createError || !created) return fail(createError?.message ?? "Could not save the videos.");
    toLink.push(...created.map((row) => row.id));

    const made = new Set(created.map((row) => `${row.platform}:${row.platform_video_id}`));
    const lost = toCreate.filter((l) => l.videoId && !made.has(`${l.platform}:${l.videoId}`));
    if (lost.length > 0) {
      const { data: winners, error: lookupError } = await db
        .from("videos")
        .select("id, platform, platform_video_id")
        .in("platform_video_id", lost.map((l) => l.videoId as string));
      if (lookupError) return fail(lookupError.message);
      for (const l of lost) {
        const row = (winners ?? []).find((w) => w.platform === l.platform && w.platform_video_id === l.videoId);
        if (!row) return fail("Could not find the video another import just saved. Try again.");
        toLink.push(row.id);
        raced += 1;
      }
    }
  }

  if (toLink.length > 0) {
    const { error: linkError } = await db
      .from("collection_videos")
      .upsert(toLink.map((video_id) => ({ collection_id: collectionId, video_id, note })),
        { onConflict: "collection_id,video_id", ignoreDuplicates: true });
    if (linkError) return fail(linkError.message);
  }

  revalidatePath("/collections");
  revalidatePath(`/collections/${collectionId}`);
  revalidatePath("/videos");
  return { added: toLink.length, reused: reused + raced, skipped };
}

export async function removeReference(formData: FormData) {
  const collectionId = string(formData, "collection_id", 64);
  const videoId = string(formData, "video_id", 64);
  if (!UUID.test(collectionId) || !UUID.test(videoId)) errorRedirect("/collections", "Invalid reference.");
  const { error } = await db.from("collection_videos")
    .delete().eq("collection_id", collectionId).eq("video_id", videoId);
  if (error) errorRedirect(`/collections/${collectionId}`, error.message);
  revalidatePath("/collections");
  revalidatePath(`/collections/${collectionId}`);
  redirect(`/collections/${collectionId}`);
}

export async function deleteCollection(formData: FormData) {
  const collectionId = string(formData, "collection_id", 64);
  if (!UUID.test(collectionId)) errorRedirect("/collections", "Invalid collection.");
  const { error } = await db.from("collections").delete().eq("id", collectionId);
  if (error) errorRedirect(`/collections/${collectionId}`, error.message);
  revalidatePath("/collections");
  redirect("/collections");
}
