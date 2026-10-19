import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  video: { id: "11111111-1111-4111-8111-111111111111", url: "https://www.youtube.com/watch?v=abcdefghijk", platform: "youtube" } as
    { id: string; url: string | null; platform: string | null } | null,
  analyzeVideo: vi.fn(),
  configured: true,
  write: vi.fn(),
  /** The current saved analysis JSON, or null for a video with none. */
  saved: null as unknown,
  savedError: false,
  captions: vi.fn(),
}));

// The route may only ever READ the database. Any write method fails the test.
vi.mock("@/lib/db", () => ({
  db: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: m.video, error: null }),
          // video_analyses: .eq("video_id").eq("is_current")
          eq: () => ({ maybeSingle: async () => ({ data: table === "video_analyses" && m.saved ? { analysis: m.saved } : null, error: table === "video_analyses" && m.savedError ? { message: "db down" } : null }) }),
        }),
      }),
      insert: m.write, update: m.write, upsert: m.write, delete: m.write,
    }),
    rpc: m.write,
  },
}));
// No test may reach YouTube.
vi.mock("@/lib/youtube-captions", () => ({ fetchYouTubeCaptions: m.captions }));
vi.mock("@/lib/video-ai", async () => {
  const actual = await vi.importActual<typeof import("@/lib/video-ai")>("@/lib/video-ai");
  return { ...actual, geminiConfigured: () => m.configured, analyzeVideo: m.analyzeVideo };
});

import { POST } from "./route";
import { VideoAiError } from "@/lib/video-ai";
import { sanitizeAnalysis } from "@/lib/video-analysis";

const ID = "11111111-1111-4111-8111-111111111111";
const ctx = { params: Promise.resolve({ id: ID }) };
const good = JSON.parse(
  JSON.stringify({ has_speech: true, transcript: [{ start: "00:00", text: "hello there" }], hook: {}, storytelling: {}, visual: {}, confidence: {}, uncertainties: [] }),
);

function request(fields: Record<string, string | Blob>, headers: Record<string, string> = {}) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return new Request(`http://localhost:3000/api/videos/${ID}/analyze`, {
    method: "POST",
    body,
    headers: {
      origin: "http://localhost:3000",
      host: "localhost:3000",
      "x-requested-with": "contentmachine",
      "content-length": "1000",
      ...headers,
    },
  });
}
const mp4 = () => new Blob([new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0, 0, 0, 0])], { type: "video/mp4" });

beforeEach(() => {
  m.configured = true;
  m.video = { id: ID, url: "https://www.youtube.com/watch?v=abcdefghijk", platform: "youtube" };
  m.analyzeVideo.mockReset().mockResolvedValue({ raw: good, model: "gemini-3.8-flash", usage: { inputTokens: 1, outputTokens: 2 } });
  m.write.mockReset();
  m.saved = null;
  m.savedError = false;
  m.captions.mockReset().mockResolvedValue({ ok: false, reason: "none", message: "This video has no captions available." });
});

describe("POST /api/videos/[id]/analyze", () => {
  it("refuses cross-site requests before doing anything", async () => {
    const res = await POST(request({ mode: "youtube" }, { origin: "https://evil.example" }), ctx);
    expect(res.status).toBe(403);
    expect(m.analyzeVideo).not.toHaveBeenCalled();
  });

  it("refuses a DNS-rebinding request whose Origin and Host agree on an attacker hostname", async () => {
    const res = await POST(request({ mode: "youtube" }, { origin: "http://evil.example:3000", host: "evil.example:3000" }), ctx);
    expect(res.status).toBe(403);
    expect(m.analyzeVideo).not.toHaveBeenCalled();
  });

  it("refuses requests without the app's marker header, which a cross-site page cannot add", async () => {
    const res = await POST(request({ mode: "youtube" }, { "x-requested-with": "" }), ctx);
    expect(res.status).toBe(403);
  });

  it("requires a declared request size", async () => {
    const res = await POST(request({ mode: "youtube" }, { "content-length": "" }), ctx);
    expect(res.status).toBe(411);
    expect(m.analyzeVideo).not.toHaveBeenCalled();
  });

  it("refuses requests with no Origin header", async () => {
    const req = new Request("http://localhost:3000/x", {
      method: "POST", body: new FormData(), headers: { host: "localhost:3000", "x-requested-with": "contentmachine" },
    });
    expect((await POST(req, ctx)).status).toBe(403);
  });

  it("returns a setup message and makes no API call when the key is missing", async () => {
    m.configured = false;
    const res = await POST(request({ mode: "youtube" }), ctx);
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("not_configured");
    expect(m.analyzeVideo).not.toHaveBeenCalled();
  });

  it("analyzes a public YouTube link and returns a preview without writing to the database", async () => {
    const res = await POST(request({ mode: "youtube" }), ctx);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(m.analyzeVideo).toHaveBeenCalledWith({ kind: "youtube", url: "https://www.youtube.com/watch?v=abcdefghijk" }, { transcript: undefined });
    expect(body.analysis.transcript.text).toBe("hello there");
    // No captions were available: the model's own transcript is used and labelled as such.
    expect(body.analysis.transcript.origin).toBe("ai");
    expect(body.transcriptSource).toBe("none");
    expect(body.transcriptNote).toMatch(/no captions/i);
    expect(body.analysis.ai).toMatchObject({ provider: "gemini", input: "youtube" });
    expect(typeof body.raw).toBe("string");
    expect(m.write).not.toHaveBeenCalled();
  });

  it("will not send a non-YouTube link to Gemini", async () => {
    m.video = { id: ID, url: "https://www.tiktok.com/@a/video/7234567890123456789", platform: "tiktok" };
    const res = await POST(request({ mode: "youtube" }), ctx);
    expect(res.status).toBe(422);
    expect(m.analyzeVideo).not.toHaveBeenCalled();
  });

  it("requires the authorization confirmation for uploads", async () => {
    const res = await POST(request({ mode: "upload", file: mp4() }), ctx);
    expect(res.status).toBe(400);
    expect(m.analyzeVideo).not.toHaveBeenCalled();
  });

  it("rejects a file that is not really an MP4, whatever its name or type", async () => {
    const fake = new Blob(["this is not a video at all, just text"], { type: "video/mp4" });
    const res = await POST(request({ mode: "upload", authorized: "yes", file: fake }), ctx);
    expect(res.status).toBe(415);
    expect(m.analyzeVideo).not.toHaveBeenCalled();
  });

  it("accepts an authorized MP4 upload", async () => {
    const res = await POST(request({ mode: "upload", authorized: "yes", file: mp4() }), ctx);
    expect(res.status).toBe(200);
    expect(m.analyzeVideo.mock.calls[0][0]).toMatchObject({ kind: "upload", mimeType: "video/mp4" });
    expect((await res.json()).analysis.ai.input).toBe("upload");
  });

  it("rejects an oversized upload by declared length before reading it", async () => {
    const res = await POST(request({ mode: "youtube" }, { "content-length": String(500 * 1024 * 1024) }), ctx);
    expect(res.status).toBe(413);
  });

  it("surfaces provider failures as friendly errors and saves nothing", async () => {
    m.analyzeVideo.mockRejectedValue(new VideoAiError("rate_limited", "Gemini rate limit or quota reached."));
    const res = await POST(request({ mode: "youtube" }), ctx);
    expect(res.status).toBe(429);
    expect((await res.json())).toMatchObject({ ok: false, code: "rate_limited" });
    expect(m.write).not.toHaveBeenCalled();
  });

  it("does not run two analyses of the same video at once", async () => {
    let release!: () => void;
    m.analyzeVideo.mockImplementationOnce(() => new Promise((resolve) => {
      release = () => resolve({ raw: good, model: "gemini-3.8-flash", usage: { inputTokens: 1, outputTokens: 2 } });
    }));
    const first = POST(request({ mode: "youtube" }), ctx);
    await vi.waitFor(() => expect(m.analyzeVideo).toHaveBeenCalledTimes(1));
    const second = await POST(request({ mode: "youtube" }), ctx);
    expect(second.status).toBe(409);
    release();
    expect((await first).status).toBe(200);
    expect(m.analyzeVideo).toHaveBeenCalledTimes(1);
  });

  it("caps concurrent analyses across different videos", async () => {
    const releases: (() => void)[] = [];
    m.analyzeVideo.mockImplementation(() => new Promise((resolve) => {
      releases.push(() => resolve({ raw: good, model: "gemini-3.8-flash", usage: { inputTokens: 1, outputTokens: 2 } }));
    }));
    const other = (n: number) => ({ params: Promise.resolve({ id: `2222222${n}-2222-4222-8222-222222222222` }) });
    const a = POST(request({ mode: "youtube" }), other(1));
    const b = POST(request({ mode: "youtube" }), other(2));
    await vi.waitFor(() => expect(m.analyzeVideo).toHaveBeenCalledTimes(2));
    const third = await POST(request({ mode: "youtube" }), other(3));
    expect(third.status).toBe(429);
    releases.forEach((r) => r());
    expect([(await a).status, (await b).status]).toEqual([200, 200]);
  });

  describe("transcript source", () => {
    const captions = (kind: "manual" | "auto") => ({
      ok: true,
      captions: {
        language: "en", kind, otherLanguages: ["fr"],
        segments: [
          { start: 0.8, end: 4.68, text: "If you flew out to the darkest, emptiest" },
          { start: 2.88, end: 7.12, text: "part of the universe" },
        ],
        text: "If you flew out to the darkest, emptiest part of the universe",
      },
    });
    const answer = (hookSpoken: string | null) => ({
      raw: { has_speech: true, hook: { spoken: hookSpoken }, storytelling: {}, visual: {}, confidence: { transcript: "high" }, uncertainties: [] },
      model: "gemini-3.5-flash-lite", usage: { inputTokens: 1, outputTokens: 2 },
    });

    it("uses YouTube's auto-captions as the transcript, with their timestamps and language, and passes them to the model", async () => {
      m.captions.mockResolvedValue(captions("auto"));
      m.analyzeVideo.mockResolvedValue(answer("If you flew out to the darkest, emptiest part of the universe"));
      const body = await (await POST(request({ mode: "youtube" }), ctx)).json();
      expect(body.transcriptSource).toBe("youtube");
      expect(body.analysis.transcript).toMatchObject({ origin: "youtube_auto", language: "en" });
      expect(body.analysis.transcript.segments[0]).toEqual({ start: 0.8, end: 4.68, text: "If you flew out to the darkest, emptiest" });
      expect(m.analyzeVideo.mock.calls[0][1].transcript).toHaveLength(2);
      // The model's own words never replace the transcript, and its self-rating of it is dropped.
      expect(body.analysis.ai.confidence.transcript).toBeUndefined();
      expect(body.analysis.hook.spoken).toBe("If you flew out to the darkest, emptiest part of the universe");
    });

    it("labels creator-written captions differently from auto-captions", async () => {
      m.captions.mockResolvedValue(captions("manual"));
      m.analyzeVideo.mockResolvedValue(answer(null));
      const body = await (await POST(request({ mode: "youtube" }), ctx)).json();
      expect(body.analysis.transcript.origin).toBe("youtube_captions");
    });

    it("removes a spoken hook that is not a verbatim quote from the transcript", async () => {
      m.captions.mockResolvedValue(captions("auto"));
      m.analyzeVideo.mockResolvedValue(answer("Imagine travelling to the emptiest corner of space"));
      const body = await (await POST(request({ mode: "youtube" }), ctx)).json();
      expect(body.analysis.hook.spoken).toBeNull();
      expect(body.warnings.join(" ")).toMatch(/not a verbatim quote/);
    });

    it("falls back to the model's transcript, and says why, when captions cannot be fetched", async () => {
      m.captions.mockResolvedValue({ ok: false, reason: "rate_limited", message: "YouTube is limiting caption requests from this connection right now." });
      const res = await POST(request({ mode: "youtube" }), ctx);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.analysis.transcript.origin).toBe("ai");
      expect(body.transcriptNote).toMatch(/limiting caption requests.*unverified/);
    });

    it("never fails the analysis when the caption fetch itself blows up", async () => {
      m.captions.mockRejectedValue(new Error("boom"));
      const res = await POST(request({ mode: "youtube" }), ctx);
      expect(res.status).toBe(200);
      expect((await res.json()).analysis.transcript.origin).toBe("ai");
    });

    it("keeps a transcript someone already supplied, and does not even ask YouTube", async () => {
      m.saved = { transcript: { text: "my own words", segments: [{ start: 1, end: 2, text: "my own words" }], origin: "pasted", language: null } };
      m.analyzeVideo.mockResolvedValue(answer(null));
      const body = await (await POST(request({ mode: "youtube" }), ctx)).json();
      expect(m.captions).not.toHaveBeenCalled();
      expect(body.transcriptSource).toBe("saved");
      expect(body.analysis.transcript).toMatchObject({ text: "my own words", origin: "pasted" });
    });

    it("does not fetch captions, or replace anything, when the saved transcript cannot be checked", async () => {
      m.savedError = true;
      m.analyzeVideo.mockResolvedValue(answer(null));
      const res = await POST(request({ mode: "youtube" }), ctx);
      expect(res.status).toBe(200);
      expect(m.captions).not.toHaveBeenCalled();
      expect((await res.json()).transcriptNote).toMatch(/could not be checked/);
    });

    it("gives the model a saved plain-text transcript that has no timed lines, and keeps it", async () => {
      m.saved = { transcript: { text: "just a pasted string", segments: [], origin: "pasted", language: null } };
      m.analyzeVideo.mockResolvedValue(answer("just a pasted string"));
      const body = await (await POST(request({ mode: "youtube" }), ctx)).json();
      expect(m.analyzeVideo.mock.calls[0][1].transcript).toEqual([{ start: null, end: null, text: "just a pasted string" }]);
      expect(body.analysis.hook.spoken).toBe("just a pasted string");
      expect(body.analysis.transcript.text).toBe("just a pasted string");
    });

    it("keeps a long untimed saved transcript whole: no stand-in line is stored, so saving it again cannot cap its text", async () => {
      const long = "word ".repeat(1000).trim();
      m.saved = { transcript: { text: long, segments: [], origin: "pasted", language: null } };
      m.analyzeVideo.mockResolvedValue(answer(null));
      const body = await (await POST(request({ mode: "youtube" }), ctx)).json();
      expect(m.analyzeVideo.mock.calls[0][1].transcript).toEqual([{ start: null, end: null, text: long }]);
      expect(body.analysis.transcript.segments).toEqual([]);
      expect(sanitizeAnalysis(body.analysis).transcript.text).toBe(long);
    });

    it("replaces a previous AI transcript with captions (the AI one was never supplied by a person)", async () => {
      m.saved = { transcript: { text: "model words", segments: [{ start: 1, end: 2, text: "model words" }], origin: "ai", language: null } };
      m.captions.mockResolvedValue(captions("auto"));
      m.analyzeVideo.mockResolvedValue(answer(null));
      const body = await (await POST(request({ mode: "youtube" }), ctx)).json();
      expect(body.analysis.transcript.origin).toBe("youtube_auto");
    });

    it("does not ask YouTube for an uploaded MP4", async () => {
      await POST(request({ mode: "upload", authorized: "yes", file: mp4() }), ctx);
      expect(m.captions).not.toHaveBeenCalled();
    });
  });

  it("handles a model answer in the wrong shape", async () => {
    m.analyzeVideo.mockResolvedValue({ raw: "not an object", model: "gemini-3.8-flash", usage: { inputTokens: 1, outputTokens: 2 } });
    const res = await POST(request({ mode: "youtube" }), ctx);
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("bad_response");
  });
});
