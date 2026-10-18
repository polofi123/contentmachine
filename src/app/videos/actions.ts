"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { seedDefaultSlots } from "./slot-seed";

export async function createVideo(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const { data, error } = await db
    .from("videos")
    .insert({ title, is_mine: true, status: "idea" })
    .select("id")
    .single();

  if (error) throw new Error(`Could not create video: ${error.message}`);

  await seedDefaultSlots(data.id);
  revalidatePath("/videos");
  redirect(`/videos/${data.id}`);
}

// Promoting an idea is the one-tap path from the capture inbox into a build.
export async function promoteIdea(formData: FormData) {
  const ideaId = String(formData.get("idea_id") ?? "");
  if (!ideaId) return;

  const { data: idea, error: readErr } = await db
    .from("ideas")
    .select("id, title, niche, promoted_video_id")
    .eq("id", ideaId)
    .single();

  if (readErr) throw new Error(`Could not read idea: ${readErr.message}`);
  if (idea.promoted_video_id) redirect(`/videos/${idea.promoted_video_id}`);

  const { data: video, error } = await db
    .from("videos")
    .insert({
      title: idea.title,
      is_mine: true,
      status: "idea",
      lego_topic: idea.niche,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Could not promote idea: ${error.message}`);

  await seedDefaultSlots(video.id);

  // status and the FK are kept in agreement by a check constraint, so both move
  // together or the write is rejected.
  await db
    .from("ideas")
    .update({ status: "promoted", promoted_video_id: video.id })
    .eq("id", ideaId);

  revalidatePath("/capture");
  revalidatePath("/videos");
  redirect(`/videos/${video.id}`);
}

// Outliers are the same row type as my own videos — this differs only by
// is_mine and by carrying the channel average the score is derived from.
export async function logOutlier(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const views = Number(formData.get("views") ?? 0);
  const channelAvg = Number(formData.get("channel_avg_views") ?? 0);

  const { data: video, error } = await db
    .from("videos")
    .insert({
      title,
      is_mine: false,
      url: String(formData.get("url") ?? "").trim() || null,
      channel_name: String(formData.get("channel_name") ?? "").trim() || null,
      channel_avg_views: channelAvg > 0 ? channelAvg : null,
      platform: "youtube",
    })
    .select("id")
    .single();

  if (error) throw new Error(`Could not log outlier: ${error.message}`);

  if (views > 0) {
    await db.from("video_metrics").insert({ video_id: video.id, views });
  }

  revalidatePath("/videos");
  redirect(`/videos/${video.id}`);
}
