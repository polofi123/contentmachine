# Automatic video analysis (Milestone 2) — plan and cost

Verified against the official docs on 2026-10-18:
<https://ai.google.dev/gemini-api/docs/video-understanding>,
<https://ai.google.dev/gemini-api/docs/structured-output>,
<https://ai.google.dev/gemini-api/docs/pricing>. SDK: `@google/genai` 2.30.

## What the docs say now (differs from older examples)

- Calls go through the **Interactions API**: `ai.interactions.create({ model, input: [...], response_format })`,
  not `models.generateContent`. Text is read from `interaction.output_text`.
- Video input is a content block: `{ type: "video", uri }` for a public YouTube URL or a Files-API upload,
  `{ type: "video", data, mime_type }` for inline. A `resolution` field sets media resolution.
- Structured output: `response_format: { type: "text", mime_type: "application/json", schema }`
  with a JSON Schema. Nullable = `type: ["string", "null"]`. Output is still validated by us.
- Timestamps in prompts and answers use `MM:SS`.
- Default model: `gemini-3.5-flash-lite` (override with `GEMINI_MODEL`). On a real 74 s Short, flash-lite took ~10 s and `gemini-3.8-flash` 110-185 s with the same transcript; 3.8 returned section end times more reliably. `gemini-2.5-*` are no longer available to new keys.
- YouTube: public videos only. Free tier is limited to 8 hours of YouTube video per day.
- Files API: up to 2 GB free / 20 GB paid; files must reach `ACTIVE` before use.

## Flow

```
Research page ─ "Analyze with AI" ─▶ POST /api/videos/[id]/analyze
   YouTube URL  ─▶ Gemini (uri)                       (no download, no upload)
   MP4 upload   ─▶ Files API ─▶ Gemini ─▶ file deleted
                         │
                         ▼
   JSON (response_format schema) ─▶ validate + map (src/lib/ai-analysis.ts)
                         │
                         ▼
   editable preview (existing import panel) ─ user approves ─▶ saveAnalysis
                         │
                         ▼
   video_analyses (new version, source = "ai_gemini"), Idea Legos fill only empty fields
```

Nothing is saved until the user approves the preview. The route never writes to the database.

## Where the transcript comes from

The transcript is stored on its own (`analysis.transcript`, with `origin` and `language`) and shown with a
label; the model's interpretation lives in separate fields. Order of preference:

1. **A transcript already saved** that a person, an SRT/VTT file or YouTube supplied. Never replaced
   without an explicit confirmation; it is passed to the model unchanged.
2. **YouTube's own captions** for a public YouTube link (free), via the `youtube-transcript-plus` package
   (`src/lib/youtube-captions.ts`). Creator-written captions are labelled "YouTube captions", generated ones
   "YouTube auto-captions"; language and per-line timestamps are kept. A handful of requests (the package re-reads the
   watch page for each of its two calls), 15 s timeout, no retries, no proxy, no login.
3. **Gemini's own transcript**, labelled "Gemini-generated (unverified)". Used automatically whenever
   captions are missing or the fetch fails; a caption problem never fails an analysis.
4. **SRT/VTT import** through the normal Import panel (added to the current analysis, not a replacement).

With a supplied transcript the model is not asked to transcribe. `hook.spoken` and section quotes must be
verbatim from it; any that are not are removed with a warning rather than shown as quotes.

Caveats: the caption endpoint is unofficial and can break without notice; auto-captions are speech
recognition and get names and jargon wrong; "Fetch captions" is one video at a time (hourly cap), never bulk.

## Guardrails

- The key is read from `GEMINI_API_KEY` on the server only; it is never sent to the client or logged.
- Route accepts same-origin requests only, one run per video at a time, MP4 only (magic-byte check), size-capped.
- Output is validated: bad timestamps are dropped, section sentences that do not appear in the transcript are
  flagged, speech-derived fields are cleared when the model reports no speech, and the model's own
  confidence and uncertainty list are stored with the analysis.
- TikTok/Instagram are not fetched; use the MP4 upload for videos you are authorized to process.

## Approximate cost per analysis (paid tier, `gemini-3.8-flash`, low media resolution)

Rates: $0.75 / 1M input tokens, $3.75 / 1M output tokens (thinking counts as output). These double on 2027-01-01.

| Video | Input tokens (~100/s + prompt) | Output tokens (est.) | Cost |
|---|---|---|---|
| 30 s | ~4.5k | ~3k | ~$0.015 |
| 60 s | ~7.5k | ~4k | ~$0.02 |
| 3 min | ~19k | ~6k | ~$0.04 |

Normal media resolution is ~258 tokens per frame (about 3x the video input). On the free tier the same
calls cost $0 (free-tier prompts may be used by Google to improve products; use the paid tier for
anything private). The UI shows an estimate before running and the actual token usage afterwards.
