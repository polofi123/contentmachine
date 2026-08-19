"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

const touch = (id: string) => revalidatePath(`/videos/${id}`);

// A slot becomes 'filled' the moment it has content, but an explicit 'skipped'
// is never overwritten by that — deciding not to do something is a decision,
// and it survives until you take it back.
async function markFilled(videoId: string, slotKey: string, filled: boolean) {
  const { data: slot } = await db
    .from("video_slots")
    .select("state")
    .eq("video_id", videoId)
    .eq("slot_key", slotKey)
    .maybeSingle();

  if (!slot || slot.state === "skipped") return;

  await db
    .from("video_slots")
    .update({ state: filled ? "filled" : "empty" })
    .eq("video_id", videoId)
    .eq("slot_key", slotKey);
}

// A component-driven slot counts only the components in ITS OWN layer —
// otherwise tagging one retention hack would mark packaging filled too.
async function refreshComponentSlot(videoId: string, slotKey: string) {
  const { data: slot } = await db
    .from("slots")
    .select("layer_id")
    .eq("key", slotKey)
    .maybeSingle();

  if (!slot?.layer_id) return;

  const { count } = await db
    .from("video_components")
    .select("id, components!inner(layer_id)", { count: "exact", head: true })
    .eq("video_id", videoId)
    .eq("components.layer_id", slot.layer_id);

  await markFilled(videoId, slotKey, (count ?? 0) > 0);
}

/* ------------------------------------------------------------------ legos */

export async function updateLegos(formData: FormData) {
  const videoId = String(formData.get("video_id") ?? "");
  if (!videoId) return;

  const f = (k: string) => String(formData.get(k) ?? "").trim() || null;

  const patch = {
    lego_topic: f("lego_topic"),
    lego_angle: f("lego_angle"),
    lego_hook: f("lego_hook"),
    lego_story_structure: f("lego_story_structure"),
    lego_visual_format: f("lego_visual_format"),
    lego_key_visuals: f("lego_key_visuals"),
    lego_audio: f("lego_audio"),
  };

  const { error } = await db.from("videos").update(patch).eq("id", videoId);
  if (error) throw new Error(`Could not save Legos: ${error.message}`);

  await markFilled(videoId, "legos", Object.values(patch).some(Boolean));
  touch(videoId);
}

export async function updateVideoMeta(formData: FormData) {
  const videoId = String(formData.get("video_id") ?? "");
  if (!videoId) return;

  const title = String(formData.get("title") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();

  const { error } = await db
    .from("videos")
    .update({
      ...(title ? { title } : {}),
      ...(status ? { status } : {}),
      notes: String(formData.get("notes") ?? "").trim() || null,
    })
    .eq("id", videoId);

  if (error) throw new Error(`Could not update video: ${error.message}`);
  touch(videoId);
}

/* --------------------------------------------------------------- loop type */

export async function setLoopType(formData: FormData) {
  const videoId = String(formData.get("video_id") ?? "");
  const raw = String(formData.get("loop_type") ?? "");
  if (!videoId) return;

  const loopType = raw === "desire" || raw === "interest" ? raw : null;

  const { error } = await db.from("videos").update({ loop_type: loopType }).eq("id", videoId);
  if (error) throw new Error(`Could not set loop type: ${error.message}`);

  await markFilled(videoId, "loop_type", Boolean(loopType));
  touch(videoId);
}

/* ------------------------------------------------------------------- slots */

// Skipping is the visible, recorded alternative to leaving something blank.
// It is what makes the completeness meter honest rather than nagging.
export async function setSlotState(formData: FormData) {
  const videoId = String(formData.get("video_id") ?? "");
  const slotKey = String(formData.get("slot_key") ?? "");
  const state = String(formData.get("state") ?? "");
  if (!videoId || !slotKey) return;

  const { error } = await db
    .from("video_slots")
    .update({ state })
    .eq("video_id", videoId)
    .eq("slot_key", slotKey);

  if (error) throw new Error(`Could not update slot: ${error.message}`);
  touch(videoId);
}

// Adding and removing slots IS editing the completeness denominator. A build
// that only cares about three things should read 3/3.
export async function addSlot(formData: FormData) {
  const videoId = String(formData.get("video_id") ?? "");
  const slotKey = String(formData.get("slot_key") ?? "");
  if (!videoId || !slotKey) return;

  const { error } = await db
    .from("video_slots")
    .insert({ video_id: videoId, slot_key: slotKey, state: "empty" });

  if (error && !error.message.includes("duplicate")) {
    throw new Error(`Could not add slot: ${error.message}`);
  }
  touch(videoId);
}

export async function removeSlot(formData: FormData) {
  const videoId = String(formData.get("video_id") ?? "");
  const slotKey = String(formData.get("slot_key") ?? "");
  if (!videoId || !slotKey) return;

  const { error } = await db
    .from("video_slots")
    .delete()
    .eq("video_id", videoId)
    .eq("slot_key", slotKey);

  if (error) throw new Error(`Could not remove slot: ${error.message}`);
  touch(videoId);
}

/* -------------------------------------------------------------- components */

// Cycles a technique through: not on this video → used → skipped → off again.
// 'skipped' is stored as a row on purpose: "I considered an open loop and chose
// not to" and "I never thought about it" are different facts, and only the
// first one makes "videos without an open loop averaged 2k views" honest.
export async function cycleComponent(formData: FormData) {
  const videoId = String(formData.get("video_id") ?? "");
  const componentId = String(formData.get("component_id") ?? "");
  const slotKey = String(formData.get("slot_key") ?? "");
  const current = String(formData.get("current") ?? "none");
  if (!videoId || !componentId) return;

  const next = current === "none" ? "used" : current === "used" ? "skipped" : "none";

  if (next === "none") {
    await db
      .from("video_components")
      .delete()
      .eq("video_id", videoId)
      .eq("component_id", componentId);
  } else if (current === "none") {
    await db
      .from("video_components")
      .insert({ video_id: videoId, component_id: componentId, state: next });
  } else {
    await db
      .from("video_components")
      .update({ state: next })
      .eq("video_id", videoId)
      .eq("component_id", componentId);
  }

  if (slotKey) await refreshComponentSlot(videoId, slotKey);
  touch(videoId);
}

// "An open loop in the first 15 seconds" is unanswerable without knowing where
// the technique landed, so placement is a first-class field, not a note.
export async function setPlacement(formData: FormData) {
  const videoId = String(formData.get("video_id") ?? "");
  const componentId = String(formData.get("component_id") ?? "");
  if (!videoId || !componentId) return;

  const raw = String(formData.get("placement_sec") ?? "").trim();
  const placement = raw === "" ? null : Number(raw);

  const { error } = await db
    .from("video_components")
    .update({
      placement_sec: placement !== null && Number.isFinite(placement) ? placement : null,
      placement_note: String(formData.get("placement_note") ?? "").trim() || null,
    })
    .eq("video_id", videoId)
    .eq("component_id", componentId);

  if (error) throw new Error(`Could not set placement: ${error.message}`);
  touch(videoId);
}

/* ------------------------------------------------------------------- hooks */

export async function addHook(formData: FormData) {
  const videoId = String(formData.get("video_id") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  if (!videoId || !text) return;

  const { error } = await db.from("hooks").insert({ video_id: videoId, text });
  if (error) throw new Error(`Could not add hook: ${error.message}`);

  await markFilled(videoId, "hook", true);
  touch(videoId);
}

// Pulling a line out of the bank attaches a copy, leaving the bank intact.
export async function useBankHook(formData: FormData) {
  const videoId = String(formData.get("video_id") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  if (!videoId || !text) return;

  await db.from("hooks").insert({ video_id: videoId, text, notes: "From the hook bank." });
  await markFilled(videoId, "hook", true);
  touch(videoId);
}

export async function selectHook(formData: FormData) {
  const videoId = String(formData.get("video_id") ?? "");
  const hookId = String(formData.get("hook_id") ?? "");
  if (!videoId || !hookId) return;

  // A partial unique index allows only one selected hook per video, so the old
  // one has to be cleared before the new one is set.
  await db.from("hooks").update({ is_selected: false }).eq("video_id", videoId);
  await db.from("hooks").update({ is_selected: true }).eq("id", hookId);

  touch(videoId);
}

export async function deleteHook(formData: FormData) {
  const videoId = String(formData.get("video_id") ?? "");
  const hookId = String(formData.get("hook_id") ?? "");
  if (!hookId) return;

  await db.from("hooks").delete().eq("id", hookId);

  const { count } = await db
    .from("hooks")
    .select("id", { count: "exact", head: true })
    .eq("video_id", videoId);
  await markFilled(videoId, "hook", (count ?? 0) > 0);

  touch(videoId);
}

// Tagging which words do which job. The picker offers the six seeded types, but
// nothing stops a type you invent — naming a new one is just a new component.
export async function toggleHookWord(formData: FormData) {
  const videoId = String(formData.get("video_id") ?? "");
  const hookId = String(formData.get("hook_id") ?? "");
  const componentId = String(formData.get("component_id") ?? "");
  const tagged = String(formData.get("tagged") ?? "") === "true";
  if (!hookId || !componentId) return;

  if (tagged) {
    await db
      .from("hook_word_tags")
      .delete()
      .eq("hook_id", hookId)
      .eq("component_id", componentId);
  } else {
    await db.from("hook_word_tags").insert({ hook_id: hookId, component_id: componentId });
  }

  touch(videoId);
}

/* ----------------------------------------------------------------- scripts */

export async function createScript(formData: FormData) {
  const videoId = String(formData.get("video_id") ?? "");
  if (!videoId) return;

  const name = String(formData.get("name") ?? "").trim() || "Draft";
  const format = String(formData.get("format") ?? "") || null;
  const dur = Number(formData.get("duration_target_sec") ?? 0);

  const { error } = await db.from("scripts").insert({
    video_id: videoId,
    name,
    format,
    duration_target_sec: dur > 0 ? dur : null,
  });

  if (error) throw new Error(`Could not create script: ${error.message}`);
  await markFilled(videoId, "script", true);
  touch(videoId);
}

export async function addBeat(formData: FormData) {
  const videoId = String(formData.get("video_id") ?? "");
  const scriptId = String(formData.get("script_id") ?? "");
  if (!scriptId) return;

  const { data: last } = await db
    .from("script_beats")
    .select("sort_order")
    .eq("script_id", scriptId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const t0 = String(formData.get("t_start_sec") ?? "").trim();
  const t1 = String(formData.get("t_end_sec") ?? "").trim();

  const { error } = await db.from("script_beats").insert({
    script_id: scriptId,
    sort_order: (last?.sort_order ?? 0) + 1,
    function_label: String(formData.get("function_label") ?? "").trim() || null,
    t_start_sec: t0 === "" ? null : Number(t0),
    t_end_sec: t1 === "" ? null : Number(t1),
    text: String(formData.get("text") ?? "").trim() || null,
  });

  if (error) throw new Error(`Could not add beat: ${error.message}`);
  touch(videoId);
}

export async function updateBeat(formData: FormData) {
  const videoId = String(formData.get("video_id") ?? "");
  const beatId = String(formData.get("beat_id") ?? "");
  if (!beatId) return;

  const t0 = String(formData.get("t_start_sec") ?? "").trim();
  const t1 = String(formData.get("t_end_sec") ?? "").trim();

  const { error } = await db
    .from("script_beats")
    .update({
      function_label: String(formData.get("function_label") ?? "").trim() || null,
      t_start_sec: t0 === "" ? null : Number(t0),
      t_end_sec: t1 === "" ? null : Number(t1),
      text: String(formData.get("text") ?? "").trim() || null,
    })
    .eq("id", beatId);

  if (error) throw new Error(`Could not update beat: ${error.message}`);
  touch(videoId);
}

export async function deleteBeat(formData: FormData) {
  const videoId = String(formData.get("video_id") ?? "");
  const beatId = String(formData.get("beat_id") ?? "");
  if (!beatId) return;

  await db.from("script_beats").delete().eq("id", beatId);
  touch(videoId);
}

export async function updateEditSpec(formData: FormData) {
  const videoId = String(formData.get("video_id") ?? "");
  const scriptId = String(formData.get("script_id") ?? "");
  if (!scriptId) return;

  await db
    .from("scripts")
    .update({ edit_spec: String(formData.get("edit_spec") ?? "").trim() || null })
    .eq("id", scriptId);

  touch(videoId);
}

/* ----------------------------------------------------------------- metrics */

// Every save is a new snapshot rather than an overwrite, so a video's history
// stays intact and "week one versus month three" remains answerable.
export async function logMetrics(formData: FormData) {
  const videoId = String(formData.get("video_id") ?? "");
  if (!videoId) return;

  const num = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v === "" ? null : Number(v);
  };

  const { error } = await db.from("video_metrics").insert({
    video_id: videoId,
    views: num("views"),
    likes: num("likes"),
    comments: num("comments"),
    retention_pct: num("retention_pct"),
    note: String(formData.get("note") ?? "").trim() || null,
  });

  if (error) throw new Error(`Could not log metrics: ${error.message}`);
  touch(videoId);
  revalidatePath("/videos");
}
