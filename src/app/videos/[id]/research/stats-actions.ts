"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import type { Database } from "@/lib/database.types";
import { outlierScore } from "@/lib/format";
import { normalizeVideoUrl } from "@/lib/platform";
import { fetchChannelAverageViews, fetchVideos, YouTubeApiError } from "@/lib/youtube-api";

type VideoUpdate = Database["public"]["Tables"]["videos"]["Update"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Titles the collection importer gives a link before anything is known about it.
const PLACEHOLDER_TITLE = /^YouTube reference(?: · [\w-]+)?$/;

export type StatsResult =
  | { ok: true; views: number | null; likes: number | null; comments: number | null; outlier: number | null; filled: string[]; note?: string }
  | { ok: false; error: string };

/**
 * Pulls public statistics for one saved YouTube video from the official API.
 *
 * Adds a new snapshot to video_metrics (history is kept, nothing is edited) and
 * fills channel name, publish date, thumbnail and the channel average only
 * where they are still empty. A title is replaced only if it is still the
 * importer's placeholder, so anything you wrote stays.
 */
export async function refreshYouTubeStats(videoId: string): Promise<StatsResult> {
  if (typeof videoId !== "string" || !UUID.test(videoId)) return { ok: false, error: "Invalid video." };

  const { data: video, error } = await db
    .from("videos")
    .select("id, url, title, channel_name, published_at, thumbnail_url, channel_avg_views")
    .eq("id", videoId)
    .maybeSingle();
  if (error) return { ok: false, error: "Could not load the video." };
  if (!video) return { ok: false, error: "Video not found." };

  const link = video.url ? normalizeVideoUrl(video.url) : null;
  if (!link || link.platform !== "youtube" || !link.videoId) {
    return { ok: false, error: "Stats can only be fetched for YouTube videos with a video link." };
  }

  try {
    const found = (await fetchVideos([link.videoId])).get(link.videoId);
    if (!found) return { ok: false, error: "YouTube did not return this video. It may be private or deleted." };

    let channelAvg = video.channel_avg_views;
    let note: string | undefined;
    if (channelAvg == null && found.channelId) {
      const avg = await fetchChannelAverageViews(found.channelId, found.videoId);
      if (avg.average !== null) channelAvg = avg.average;
      else note = "Not enough recent uploads on this channel to compute an outlier score.";
    }

    const { error: snapError } = await db
      .from("video_metrics")
      .insert({ video_id: videoId, views: found.views, likes: found.likes, comments: found.comments, note: "YouTube Data API" });
    if (snapError) return { ok: false, error: "Could not save the statistics." };

    const update: VideoUpdate = {};
    if (!video.channel_name && found.channelTitle) update.channel_name = found.channelTitle;
    if (!video.published_at && found.publishedAt) update.published_at = found.publishedAt;
    if (!video.thumbnail_url && found.thumbnail) update.thumbnail_url = found.thumbnail;
    if (video.channel_avg_views == null && channelAvg != null) update.channel_avg_views = channelAvg;
    if (found.title && PLACEHOLDER_TITLE.test(video.title.trim())) update.title = found.title;

    const filled = Object.keys(update);
    if (filled.length) {
      const { error: updateError } = await db.from("videos").update(update).eq("id", videoId);
      if (updateError) return { ok: false, error: "Stats were saved, but the video details could not be updated." };
    }

    revalidatePath(`/videos/${videoId}`, "layout");
    revalidatePath("/collections", "layout");
    return {
      ok: true,
      views: found.views,
      likes: found.likes,
      comments: found.comments,
      outlier: outlierScore(found.views, channelAvg),
      filled,
      note,
    };
  } catch (err) {
    if (err instanceof YouTubeApiError) return { ok: false, error: err.message };
    return { ok: false, error: "The YouTube request failed. Nothing was changed." };
  }
}
