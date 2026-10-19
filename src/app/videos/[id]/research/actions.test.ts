import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { rpc: m.rpc } }));

import { mapAiResponse } from "@/lib/ai-analysis";
import { saveAnalysis } from "./actions";

const VIDEO = "11111111-1111-4111-8111-111111111111";
const aiAnalysis = mapAiResponse(
  { has_speech: true, transcript: [{ start: "00:01", text: "hello there" }], hook: {}, storytelling: {}, visual: {}, confidence: { hook: "high" }, uncertainties: ["x"] },
  { model: "gemini-3.8-flash", input: "youtube", usage: { inputTokens: 1, outputTokens: 2 } },
).analysis;

const save = (source: string, analysis: unknown = aiAnalysis) =>
  saveAnalysis({ videoId: VIDEO, source, raw: "{}", warnings: [], analysis, applyLegos: false });

beforeEach(() => m.rpc.mockReset().mockResolvedValue({ data: 3, error: null }));

describe("saveAnalysis provenance", () => {
  it("keeps AI provenance and the transcript origin for an AI-sourced save", async () => {
    const res = await save("ai_gemini");
    expect(res).toMatchObject({ ok: true, version: 3 });
    const args = m.rpc.mock.calls[0][1];
    expect(args.p_source).toBe("ai_gemini");
    expect(args.p_source_label).toBe("AI analysis (Gemini)");
    expect(args.p_analysis.ai).toMatchObject({ provider: "gemini", model: "gemini-3.8-flash", confidence: { hook: "high" } });
    expect(args.p_analysis.transcript.origin).toBe("ai");
    expect(args.p_analysis.transcript.segments[0].start).toBe(1);
  });

  it("strips AI provenance from a paste or manual save, which cannot claim to be model output", async () => {
    for (const source of ["manual", "json", "plain_text", "sandcastles_export", "bogus"]) {
      m.rpc.mockClear();
      await save(source);
      expect(m.rpc.mock.calls[0][1].p_analysis.ai).toBeNull();
    }
  });

  it("drops an unparseable generation date rather than storing it", async () => {
    const forged = { ...aiAnalysis, ai: { ...aiAnalysis.ai!, generatedAt: "not a date" } };
    await save("ai_gemini", forged);
    expect(m.rpc.mock.calls[0][1].p_analysis.ai.generatedAt).toBe("");
  });

  it("rejects malformed requests before touching the database", async () => {
    expect(await saveAnalysis({ videoId: "nope", source: "manual", raw: "", warnings: [], analysis: {}, applyLegos: false })).toMatchObject({ ok: false });
    expect(await saveAnalysis({ videoId: VIDEO, source: "manual", raw: 5 as never, warnings: [], analysis: {}, applyLegos: false })).toMatchObject({ ok: false });
    expect(m.rpc).not.toHaveBeenCalled();
  });
});
