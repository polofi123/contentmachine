import { db } from "@/lib/db";

// Shared by both action files. Not exported from a "use server" module on
// purpose — everything exported from one of those becomes a callable endpoint,
// and this is an internal helper, not an action.

/**
 * A slot becomes 'filled' the moment it has content, but an explicit 'skipped'
 * is never overwritten by that — deciding not to do something is a decision,
 * and it survives until you take it back.
 */
export async function markFilled(videoId: string, slotKey: string, filled: boolean) {
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
