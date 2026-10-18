import { db } from "@/lib/db";

// Shared by videos/actions.ts and hooks/actions.ts. Not exported from a
// "use server" module on purpose — everything exported from one of those
// becomes a callable endpoint, and this is an internal helper, not an action.
// Same reasoning as [id]/slot-fill.ts.

/**
 * A new video starts with the default slot template rather than zero slots.
 *
 * "Everything optional, everything extensible" with no starting opinion is just
 * a blank page — the template is the counterweight, and every slot on it can be
 * dropped in one click.
 */
export async function seedDefaultSlots(videoId: string) {
  const { data: slots } = await db
    .from("slots")
    .select("key")
    .eq("in_default_template", true);

  if (!slots?.length) return;

  await db
    .from("video_slots")
    .insert(slots.map((s) => ({ video_id: videoId, slot_key: s.key, state: "empty" })));
}
