// Decides which transcript an analysis should be built on. Server-only.
//
// Order: a transcript already saved for this video that a person, a file or
// YouTube supplied (never replaced unless the caller says so explicitly), then
// YouTube's own captions for a YouTube link, then nothing — in which case the
// video model's own transcription is used and labeled unverified.
//
// Reads the database; writes nothing.

import { db } from "./db";
import { fetchYouTubeCaptions, type CaptionOutcome } from "./youtube-captions";
import { emptyAnalysis, isProtectedTranscript, sanitizeAnalysis, type VideoAnalysis } from "./video-analysis";

export type TranscriptChoice =
  | { from: "saved"; transcript: VideoAnalysis["transcript"]; note: string | null }
  | { from: "youtube"; transcript: VideoAnalysis["transcript"]; note: string | null }
  /** No supplied transcript; `note` says why captions were not used, when they were tried. */
  | { from: "none"; transcript: null; note: string | null };

/** The video's current saved analysis, an empty one if there is none, or null if it could not be read. */
export async function currentAnalysis(videoId: string): Promise<VideoAnalysis | null> {
  try {
    const { data, error } = await db.from("video_analyses").select("analysis").eq("video_id", videoId).eq("is_current", true).maybeSingle();
    if (error) return null;
    return data ? sanitizeAnalysis(data.analysis) : emptyAnalysis();
  } catch {
    // Null means "could not tell", which is not the same as "nothing saved":
    // callers must not replace a transcript they could not check for.
    return null;
  }
}

/** The lines to show the model: the transcript's own, or its whole text as one line when it has none. */
export function promptSegments(t: VideoAnalysis["transcript"]): VideoAnalysis["transcript"]["segments"] {
  if (t.segments.length) return t.segments;
  return t.text ? [{ start: null, end: null, text: t.text }] : [];
}

export function transcriptFromCaptions(outcome: Extract<CaptionOutcome, { ok: true }>): VideoAnalysis["transcript"] {
  const { captions } = outcome;
  return {
    text: captions.text,
    segments: captions.segments,
    origin: captions.kind === "manual" ? "youtube_captions" : "youtube_auto",
    language: captions.language,
  };
}

export async function chooseTranscript(opts: {
  saved: VideoAnalysis;
  /** Set for a public YouTube link; captions are only tried then. */
  youtubeId: string | null;
  /** Replace a saved transcript that a person, a file or YouTube supplied. Only ever true on explicit confirmation. */
  replaceSaved?: boolean;
  fetchCaptions?: typeof fetchYouTubeCaptions;
}): Promise<TranscriptChoice> {
  const { saved, youtubeId, replaceSaved = false } = opts;
  if (!replaceSaved && isProtectedTranscript(saved.transcript)) {
    // A saved transcript with text but no lines (a pasted plain string) is still
    // the transcript to use. It is returned as it was saved: a one-line stand-in
    // is made only for the prompt (promptSegments), because saving it back would
    // cap the text at the per-line limit.
    return { from: "saved", transcript: { ...saved.transcript }, note: null };
  }
  if (!youtubeId) return { from: "none", transcript: null, note: null };

  let outcome: CaptionOutcome;
  try {
    outcome = await (opts.fetchCaptions ?? fetchYouTubeCaptions)(youtubeId);
  } catch {
    outcome = { ok: false, reason: "failed", message: "The captions could not be retrieved from YouTube." };
  }
  if (!outcome.ok) {
    return { from: "none", transcript: null, note: `${outcome.message} Gemini's own transcript is used instead and is marked unverified.` };
  }
  const note = outcome.captions.otherLanguages.length
    ? `Also available in: ${outcome.captions.otherLanguages.slice(0, 8).join(", ")}.`
    : null;
  return { from: "youtube", transcript: transcriptFromCaptions(outcome), note };
}
