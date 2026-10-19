"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { legoPatch, sanitizeAnalysis, type AnalysisSource, type LegoPatch } from "@/lib/video-analysis";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE_LABELS: Record<AnalysisSource, string> = {
  sandcastles_export: "Sandcastles export (pasted)",
  json: "JSON (pasted)",
  plain_text: "Text (pasted)",
  manual: "Manual entry",
};
// Server Actions reject bodies over 1 MB, so the pasted original is capped well
// below that (the client applies the same cap) and the parsed analysis is
// bounded separately. Both fail with a readable message, not a framework error.
const MAX_RAW = 200_000;
const MAX_ANALYSIS_JSON = 600_000;

export type SaveResult =
  | { ok: true; version: number; legosFilled: string[]; warning?: string }
  | { ok: false; error: string };

/**
 * Saves a reviewed analysis as the video's new current version.
 *
 * Demote-and-insert happens inside one database function (save_video_analysis)
 * so a failure or a double submit can never leave the video with no current
 * analysis. History is kept: the previous version stays, just not current.
 *
 * Idea Legos are filled afterwards, field by field, and only while that field
 * is still empty at write time — text written in the workbench in the meantime
 * is never overwritten. A Lego failure is a warning, not a failed save.
 */
export async function saveAnalysis(input: {
  videoId: string;
  source: string;
  raw: string;
  warnings: string[];
  analysis: unknown;
  applyLegos: boolean;
}): Promise<SaveResult> {
  if (!input || typeof input !== "object") return { ok: false, error: "Invalid request." };
  if (typeof input.videoId !== "string" || !UUID.test(input.videoId)) return { ok: false, error: "Invalid video." };
  if (typeof input.raw !== "string") return { ok: false, error: "Invalid pasted text." };
  const warnings = Array.isArray(input.warnings) ? input.warnings.filter((w): w is string => typeof w === "string") : [];
  const source: AnalysisSource = input.source in SOURCE_LABELS ? (input.source as AnalysisSource) : "manual";

  const analysis = sanitizeAnalysis(input.analysis);
  const analysisJson = JSON.parse(JSON.stringify(analysis));
  if (JSON.stringify(analysisJson).length > MAX_ANALYSIS_JSON) {
    return { ok: false, error: "This analysis is too large to save. Trim the transcript or sections and try again." };
  }

  const { data: version, error } = await db.rpc("save_video_analysis", {
    p_video_id: input.videoId,
    p_source: source,
    p_source_label: SOURCE_LABELS[source],
    p_analysis: analysisJson,
    p_raw: input.raw.slice(0, MAX_RAW),
    p_warnings: warnings.slice(0, 50).map((w) => w.slice(0, 500)),
  });
  if (error || typeof version !== "number") {
    return { ok: false, error: error?.message ?? "Could not save the analysis." };
  }

  const legosFilled: string[] = [];
  let warning: string | undefined;
  if (input.applyLegos === true) {
    for (const [field, value] of Object.entries(legoPatch(analysis))) {
      // Conditional on the field still being empty when the write happens.
      const { data, error: legoError } = await db
        .from("videos")
        .update({ [field]: value } as LegoPatch)
        .eq("id", input.videoId)
        .or(`${field}.is.null,${field}.eq.`)
        .select("id");
      if (legoError) warning = `Analysis saved, but some Idea Legos were not updated: ${legoError.message}`;
      else if (data?.length) legosFilled.push(field);
    }
  }

  revalidatePath(`/videos/${input.videoId}`, "layout");
  return { ok: true, version, legosFilled, warning };
}
