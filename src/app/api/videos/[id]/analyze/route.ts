import { db } from "@/lib/db";
import { mapAiResponse } from "@/lib/ai-analysis";
import { normalizeVideoUrl } from "@/lib/platform";
import { BodyTooLargeError, createRunLimiter, isTrustedRequest, limitBody } from "@/lib/request-guard";
import { chooseTranscript, currentAnalysis, promptSegments, type TranscriptChoice } from "@/lib/transcript-source";
import { analyzeVideo, geminiConfigured, toVideoAiError, VideoAiError, type VideoInput } from "@/lib/video-ai";

// Runs an AI analysis and RETURNS it. It never writes to the database: the
// result goes to the editable preview, and only the user's approval saves it
// (through the existing saveAnalysis action).

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

// One analysis per video at a time (a double-click must not be billed twice),
// at most two at once overall, and a ceiling per hour so a runaway loop or a
// stuck client cannot drain the quota. In memory: this is one local process.
const running = new Set<string>();
const limiter = createRunLimiter({
  limit: Number(process.env.GEMINI_MAX_RUNS_PER_HOUR) || 30,
  windowMs: 60 * 60 * 1000,
  concurrent: 2,
});

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status });
const fail = (status: number, code: string, error: string) => json(status, { ok: false, code, error });

/** MP4/MOV containers carry "ftyp" at byte 4. Checked on bytes, not on the claimed type. */
async function looksLikeMp4(blob: Blob): Promise<boolean> {
  const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  return head.length >= 12 && String.fromCharCode(...head.slice(4, 8)) === "ftyp";
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isTrustedRequest(req)) return fail(403, "forbidden", "Cross-site requests are not allowed.");

  const { id } = await ctx.params;
  if (!UUID.test(id)) return fail(400, "invalid", "Invalid video.");
  if (!geminiConfigured()) {
    return fail(503, "not_configured", "Automatic analysis is not set up: add GEMINI_API_KEY to .env.local and restart the server.");
  }

  // A length must be declared, and the body is then read through a byte
  // counter, so neither an absent nor an understated Content-Length lets more
  // than the limit into memory.
  const maxBody = MAX_UPLOAD_BYTES + 1_000_000;
  const declared = Number(req.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0) return fail(411, "invalid", "The request must declare its size.");
  if (declared > maxBody || !req.body) {
    return fail(413, "too_large", `That file is too large. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
  }

  let form: FormData;
  try {
    const guarded = new Request(req.url, {
      method: "POST",
      headers: req.headers,
      body: limitBody(req.body, maxBody),
      duplex: "half",
    } as RequestInit);
    form = await guarded.formData();
  } catch (err) {
    if (err instanceof BodyTooLargeError || (err as { cause?: unknown })?.cause instanceof BodyTooLargeError) {
      return fail(413, "too_large", `That file is too large. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
    }
    return fail(400, "invalid", "Could not read the request.");
  }
  const mode = form.get("mode");

  const { data: video, error } = await db.from("videos").select("id, url, platform").eq("id", id).maybeSingle();
  if (error) return fail(500, "failed", "Could not load the video.");
  if (!video) return fail(404, "invalid", "Video not found.");

  let input: VideoInput;
  let youtubeId: string | null = null;
  if (mode === "youtube") {
    const link = video.url ? normalizeVideoUrl(video.url) : null;
    if (!link || link.platform !== "youtube" || !link.videoId) {
      return fail(422, "unsupported", "Only public YouTube videos can be analyzed from a link. Upload the MP4 for this video instead.");
    }
    youtubeId = link.videoId;
    input = { kind: "youtube", url: `https://www.youtube.com/watch?v=${encodeURIComponent(link.videoId)}` };
  } else if (mode === "upload") {
    if (form.get("authorized") !== "yes") {
      return fail(400, "invalid", "Confirm that you are authorized to process this video.");
    }
    const file = form.get("file");
    if (!(file instanceof Blob) || file.size === 0) return fail(400, "invalid", "Choose an MP4 file.");
    if (file.size > MAX_UPLOAD_BYTES) {
      return fail(413, "too_large", `That file is too large. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
    }
    if (!(await looksLikeMp4(file))) return fail(415, "unsupported", "That does not look like an MP4 video file.");
    input = { kind: "upload", blob: file, mimeType: "video/mp4" };
  } else {
    return fail(400, "invalid", "Unknown analysis mode.");
  }

  if (running.has(id)) return fail(409, "busy", "An analysis for this video is already running.");
  const slot = limiter.acquire();
  if (!slot.ok) {
    return slot.reason === "busy"
      ? fail(429, "rate_limited", "Two analyses are already running. Wait for one to finish.")
      : fail(429, "rate_limited", "Hourly analysis limit reached (a safeguard against runaway spending). Try again later.");
  }
  running.add(id);
  try {
    // The transcript comes first: a saved one a person or file supplied, else
    // YouTube's own captions, else none (Gemini then transcribes, unverified).
    // This step cannot fail the analysis; a caption problem only changes the source.
    const saved = await currentAnalysis(id);
    const choice: TranscriptChoice = saved
      ? await chooseTranscript({ saved, youtubeId })
      : { from: "none", transcript: null, note: "The saved transcript could not be checked, so no captions were fetched. Gemini's own transcript is used and is marked unverified." };
    const result = await analyzeVideo(input, { transcript: choice.transcript ? promptSegments(choice.transcript) : undefined });
    let mapped: ReturnType<typeof mapAiResponse>;
    try {
      mapped = mapAiResponse(result.raw, {
        model: result.model,
        input: input.kind === "youtube" ? "youtube" : "upload",
        usage: result.usage,
        transcript: choice.transcript,
      });
    } catch {
      throw new VideoAiError("bad_response", "Gemini returned an answer in an unexpected shape. Try again.");
    }
    const { analysis, warnings } = mapped;
    if (result.transcriptTruncated) {
      warnings.push("The transcript was too long to send in full, so the analysis is based on the first part of it.");
    }
    return json(200, {
      ok: true,
      analysis,
      warnings,
      // The model's own JSON, kept as the "original input" for the saved version.
      raw: JSON.stringify(result.raw, null, 2),
      model: result.model,
      usage: result.usage,
      // Where the transcript came from, and why captions were not used if they were tried.
      transcriptSource: choice.from,
      transcriptNote: choice.note,
    });
  } catch (err) {
    const e = err instanceof VideoAiError ? err : toVideoAiError(err);
    const status = e.code === "rate_limited" ? 429 : e.code === "not_configured" ? 503 : e.code === "unsupported" ? 422 : 502;
    return fail(status, e.code, e.message);
  } finally {
    running.delete(id);
    slot.release();
  }
}
