"use server";

import { revalidatePath } from "next/cache";
import { aiConfigured } from "@/lib/ai";
import { createRunLimiter } from "@/lib/request-guard";
import { MappingError, reviewMapping, runMapping, type MappingRunResult } from "./mapping";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Each run is three paid model calls. One at a time, never the same video twice at
// once, and an hourly ceiling so a stuck client cannot drain the account. In
// memory: this is one local process.
const running = new Set<string>();
const limiter = createRunLimiter({ limit: Number(process.env.MAPPING_MAX_RUNS_PER_HOUR) > 0 ? Number(process.env.MAPPING_MAX_RUNS_PER_HOUR) : 20, windowMs: 60 * 60 * 1000, concurrent: 1 });

export type MapResult = { ok: true; result: MappingRunResult } | { ok: false; error: string };

/** Maps the video's current analysis onto the library and saves it as the current run. */
export async function mapComponents(videoId: string): Promise<MapResult> {
  if (typeof videoId !== "string" || !UUID.test(videoId)) return { ok: false, error: "Invalid video." };
  if (!aiConfigured()) return { ok: false, error: "Mapping is not set up: add ANTHROPIC_API_KEY to .env.local and restart the server." };
  if (running.has(videoId)) return { ok: false, error: "A mapping for this video is already running." };
  const slot = limiter.acquire();
  if (!slot.ok) {
    return { ok: false, error: slot.reason === "busy" ? "Another mapping is already running. Wait for it to finish." : "Hourly mapping limit reached (a safeguard against runaway spending). Try again later." };
  }
  running.add(videoId);
  let result: MappingRunResult;
  try {
    result = await runMapping(videoId);
  } catch (err) {
    return { ok: false, error: err instanceof MappingError ? err.message : "The mapping failed. Nothing was saved." };
  } finally {
    running.delete(videoId);
    slot.release();
  }
  // After the save: a failure here must not be reported as "nothing was saved".
  try { revalidatePath(`/videos/${videoId}/research`); } catch { /* the page refreshes on the client anyway */ }
  return { ok: true, result };
}

export type ReviewResult = { ok: true } | { ok: false; error: string };

/**
 * Records a person's Confirm / Reject (or withdraws an earlier one). Appends to the
 * mapping's review history; the AI's own evidence and status are never changed.
 */
export async function reviewComponentMapping(input: {
  videoId: string; mappingId: string; decision: "confirmed" | "rejected" | "cleared"; note?: string; watchedVideo?: boolean;
}): Promise<ReviewResult> {
  if (!input || typeof input !== "object") return { ok: false, error: "Invalid request." };
  if (typeof input.videoId !== "string" || !UUID.test(input.videoId)) return { ok: false, error: "Invalid video." };
  if (typeof input.mappingId !== "string" || !UUID.test(input.mappingId)) return { ok: false, error: "Invalid mapping." };
  if (input.note !== undefined && typeof input.note !== "string") return { ok: false, error: "Invalid note." };
  try {
    await reviewMapping({ videoId: input.videoId, mappingId: input.mappingId, decision: input.decision, note: input.note, watchedVideo: input.watchedVideo === true });
  } catch (err) {
    return { ok: false, error: err instanceof MappingError ? err.message : "The review could not be saved." };
  }
  try { revalidatePath(`/videos/${input.videoId}/research`); } catch { /* the client refreshes anyway */ }
  return { ok: true };
}
