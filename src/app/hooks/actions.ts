"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { askJson } from "@/lib/ai";
import { seedDefaultSlots } from "../videos/slot-seed";
import { markFilled } from "../videos/[id]/slot-fill";

// The hook bank, as writes.
//
// A bank hook is a `hooks` row with no `video_id`. That is not a new concept
// bolted on: the table has always allowed it, `hooks_bank_idx` indexes exactly
// those rows, and the workbench's "pull from the bank" already reads them. This
// screen is the front door to a room that was already built.
//
// Everything here is scoped to `video_id is null`. A hook that belongs to a
// video is that video's business and is edited on its workbench — letting this
// screen delete one would be a stray tap wiping a line out of a script.

const touch = () => {
  revalidatePath("/hooks");
  revalidatePath("/plan");
};

// One field, one insert. Same bargain as /capture: a hook you had to fill in a
// form to record is a hook you did not write down.
export async function captureHook(formData: FormData) {
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;

  const { error } = await db.from("hooks").insert({ text });
  if (error) throw new Error(`Could not capture hook: ${error.message}`);

  touch();
}

export async function dropHook(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // `video_id is null` is the guard, not a filter: without it this deletes a
  // line out of somebody's script by id.
  const { error } = await db.from("hooks").delete().eq("id", id).is("video_id", null);
  if (error) throw new Error(`Could not drop hook: ${error.message}`);

  touch();
}

// Which of the six words this line actually does. The tags are the same
// `hook_word_tags` rows the workbench writes, so a hook tagged here arrives at
// a video already marked up.
export async function toggleBankHookWord(formData: FormData) {
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

  touch();
}

/**
 * Promote a bank line into a video.
 *
 * The bank keeps the line — a copy is attached to the new video and selected.
 * That is `useBankHook`'s rule, not a new one: a hook shape that worked once is
 * worth reaching for again, and a bank that empties itself every time you build
 * something is a bank that is empty when you need it.
 *
 * The word tags are copied with it, because re-tagging a line you already
 * tagged is exactly the busywork that stops people tagging.
 */
export async function buildFromHook(formData: FormData) {
  const hookId = String(formData.get("hook_id") ?? "");
  if (!hookId) return;

  const { data: hook, error: readErr } = await db
    .from("hooks")
    .select("id, text")
    .eq("id", hookId)
    .is("video_id", null)
    .maybeSingle();

  if (readErr) throw new Error(`Could not read hook: ${readErr.message}`);
  if (!hook) return;

  const { data: video, error } = await db
    .from("videos")
    .insert({ title: hook.text, is_mine: true, status: "idea" })
    .select("id")
    .single();

  if (error) throw new Error(`Could not build from hook: ${error.message}`);

  await seedDefaultSlots(video.id);

  const { data: copy } = await db
    .from("hooks")
    .insert({
      video_id: video.id,
      text: hook.text,
      is_selected: true,
      notes: "From the hook bank.",
    })
    .select("id")
    .single();

  if (copy) {
    const { data: tags } = await db
      .from("hook_word_tags")
      .select("component_id")
      .eq("hook_id", hook.id);

    if (tags?.length) {
      await db
        .from("hook_word_tags")
        .insert(tags.map((t) => ({ hook_id: copy.id, component_id: t.component_id })));
    }
  }

  await markFilled(video.id, "hook", true);

  touch();
  revalidatePath("/videos");
  redirect(`/videos/${video.id}`);
}

/* -------------------------------------------------------------------- riffs */

/**
 * A riff is a suggestion, not a row.
 *
 * It comes back to the screen and stops there. Nothing is written until you tap
 * `keep`, which is the rule the storytelling panel already runs on: the model
 * reads and proposes, the creator decides, and the database only ever holds
 * lines a person chose. An assistant that silently filled the bank with its own
 * hooks would be generating your content and calling it your framework.
 */
export type Riff = { text: string; adds: string };

const RIFF_SCHEMA = {
  type: "object",
  properties: {
    variations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          // Named so the screen can show what each variation is *for*. Three
          // unlabelled alternatives are a menu; three labelled ones are an
          // argument about what the original was missing.
          adds: { type: "string" },
        },
        required: ["text", "adds"],
        additionalProperties: false,
      },
    },
  },
  required: ["variations"],
  additionalProperties: false,
};

export async function riffHook(hookId: string): Promise<Riff[]> {
  const [{ data: hook }, { data: wordTypes }] = await Promise.all([
    db.from("hooks").select("id, text").eq("id", hookId).is("video_id", null).maybeSingle(),
    db
      .from("components")
      .select("id, source_id, name, body")
      .like("source_id", "HOOKW-%")
      .is("archived_at", null)
      .order("source_id"),
  ]);

  if (!hook) throw new Error("That hook is no longer in the bank.");

  const { data: tags } = await db
    .from("hook_word_tags")
    .select("component_id")
    .eq("hook_id", hook.id);

  const tagged = new Set((tags ?? []).map((t) => t.component_id));
  const types = wordTypes ?? [];
  const missing = types.filter((w) => !tagged.has(w.id)).map((w) => w.name);

  // The six word definitions are sent verbatim from the library rather than
  // restated here. Rename a word type in /library and the prompt follows — a
  // prompt carrying its own private copy of the framework is a second framework.
  const prompt = [
    "THE SIX HOOK WORDS — a hook is assembled from these:",
    "",
    ...types.map((w) => `${w.name}\n${(w.body ?? "").trim()}`),
    "",
    "THE HOOK",
    hook.text,
    "",
    tagged.size > 0
      ? `Already doing: ${types
          .filter((w) => tagged.has(w.id))
          .map((w) => w.name)
          .join(", ")}`
      : "Nothing tagged yet — read the line and judge for yourself which jobs it already does.",
    missing.length > 0 ? `Not doing: ${missing.join(", ")}` : "It does all six.",
    "",
    "Write exactly 3 variations of this hook. Each one adds at least one word",
    "type the original is missing — prefer the Objective/End State and Contrast",
    "words first, since those carry the interest. Keep the creator's own",
    "phrasing wherever it already works; these are lines they will say out loud",
    "to a camera, not copy written at them.",
    "",
    "For each, `adds` is a few words naming what it added — 'a specific end",
    "state', 'a timeframe + proof'. Not a sentence.",
  ].join("\n");

  const result = await askJson<{ variations: Riff[] }>({
    prompt,
    schema: RIFF_SCHEMA,
    maxTokens: 2000,
  });

  return (result.variations ?? [])
    .filter((v) => v.text?.trim())
    // One line, always. A model mid-flow will sometimes hand back its own
    // numbered list inside a single string, and that would land in the bank
    // verbatim.
    .map((v) => ({ text: v.text.split("\n")[0].trim(), adds: (v.adds ?? "").trim() }))
    .slice(0, 3);
}

export async function keepRiff(formData: FormData) {
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;

  const { error } = await db.from("hooks").insert({ text, notes: "Riffed from a bank line." });
  if (error) throw new Error(`Could not keep that line: ${error.message}`);

  touch();
}
