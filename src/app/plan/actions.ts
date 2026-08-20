"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

const touch = () => {
  revalidatePath("/plan");
  revalidatePath("/videos");
};

// A month always keys off its first day, so the goal and its pillar targets
// can never disagree about which month they belong to. Not exported: every
// export from a "use server" module has to be an async server function.
const firstOfMonth = (d: string) => `${d.slice(0, 7)}-01`;

export async function setGoal(formData: FormData) {
  const month = firstOfMonth(String(formData.get("month") ?? ""));
  const target = Number(formData.get("target_posts") ?? 0);
  if (!month) return;

  const { error } = await db
    .from("plan_goals")
    .upsert({ month, target_posts: Math.max(0, target) }, { onConflict: "month" });

  if (error) throw new Error(`Could not set goal: ${error.message}`);
  touch();
}

// The mix target is the whole point of tracking pillars: "post daily" is
// otherwise satisfied by thirty of whatever is easiest to make that week.
export async function setPillarTarget(formData: FormData) {
  const month = firstOfMonth(String(formData.get("month") ?? ""));
  const pillar = String(formData.get("pillar") ?? "").trim().toLowerCase();
  const target = Number(formData.get("target_count") ?? 0);
  if (!month || !pillar) return;

  // The targets table points at plan_goals, so the month has to exist first.
  await db.from("plan_goals").upsert({ month }, { onConflict: "month", ignoreDuplicates: true });

  if (target <= 0) {
    await db.from("plan_pillar_targets").delete().eq("month", month).eq("pillar", pillar);
  } else {
    const { error } = await db
      .from("plan_pillar_targets")
      .upsert({ month, pillar, target_count: target }, { onConflict: "month,pillar" });
    if (error) throw new Error(`Could not set pillar target: ${error.message}`);
  }

  touch();
}

export async function schedule(formData: FormData) {
  const videoId = String(formData.get("video_id") ?? "");
  const day = String(formData.get("day") ?? "").trim();
  if (!videoId) return;

  const { error } = await db
    .from("videos")
    .update({ planned_publish_at: day || null })
    .eq("id", videoId);

  if (error) throw new Error(`Could not schedule: ${error.message}`);
  touch();
}

export async function setPillar(formData: FormData) {
  const videoId = String(formData.get("video_id") ?? "");
  const pillar = String(formData.get("pillar") ?? "").trim().toLowerCase();
  if (!videoId) return;

  const { error } = await db
    .from("videos")
    .update({ pillar: pillar || null })
    .eq("id", videoId);

  if (error) throw new Error(`Could not set pillar: ${error.message}`);
  touch();
}

// Filling a day should cost one line of typing. Anything heavier and the
// month does not get filled, which is the only failure that matters here.
export async function quickAdd(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const day = String(formData.get("day") ?? "").trim();
  const pillar = String(formData.get("pillar") ?? "").trim().toLowerCase();
  if (!title || !day) return;

  const { data, error } = await db
    .from("videos")
    .insert({
      title,
      is_mine: true,
      status: "idea",
      planned_publish_at: day,
      pillar: pillar || null,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Could not add: ${error.message}`);

  const { data: slots } = await db
    .from("slots")
    .select("key")
    .eq("in_default_template", true);

  if (slots?.length) {
    await db
      .from("video_slots")
      .insert(slots.map((s) => ({ video_id: data.id, slot_key: s.key, state: "empty" })));
  }

  touch();
}

// Pulling straight from the bank onto a day — the fastest way to fill a month
// is from ideas you already had.
export async function scheduleIdea(formData: FormData) {
  const ideaId = String(formData.get("idea_id") ?? "");
  const day = String(formData.get("day") ?? "").trim();
  if (!ideaId || !day) return;

  const { data: idea } = await db
    .from("ideas")
    .select("id, title, niche, promoted_video_id")
    .eq("id", ideaId)
    .single();

  if (!idea) return;

  if (idea.promoted_video_id) {
    await db.from("videos").update({ planned_publish_at: day }).eq("id", idea.promoted_video_id);
    touch();
    return;
  }

  const { data: video, error } = await db
    .from("videos")
    .insert({
      title: idea.title,
      is_mine: true,
      status: "idea",
      planned_publish_at: day,
      pillar: idea.niche?.toLowerCase() ?? null,
      lego_topic: idea.niche,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Could not schedule idea: ${error.message}`);

  const { data: slots } = await db
    .from("slots")
    .select("key")
    .eq("in_default_template", true);

  if (slots?.length) {
    await db
      .from("video_slots")
      .insert(slots.map((s) => ({ video_id: video.id, slot_key: s.key, state: "empty" })));
  }

  await db
    .from("ideas")
    .update({ status: "promoted", promoted_video_id: video.id })
    .eq("id", ideaId);

  revalidatePath("/capture");
  touch();
}

export async function markPublished(formData: FormData) {
  const videoId = String(formData.get("video_id") ?? "");
  if (!videoId) return;

  await db
    .from("videos")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", videoId);

  touch();
}
