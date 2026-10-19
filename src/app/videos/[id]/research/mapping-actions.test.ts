import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ configured: true, runMapping: vi.fn(), reviewMapping: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/ai", () => ({ aiConfigured: () => m.configured }));
vi.mock("./mapping", async () => {
  class MappingError extends Error {}
  return { MappingError, runMapping: m.runMapping, reviewMapping: m.reviewMapping };
});

import { MappingError } from "./mapping";
import { mapComponents, reviewComponentMapping } from "./mapping-actions";

const ID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ok = { runId: "r", counts: { aiSupported: 1, uncertain: 2 }, coverage: { libraryElements: 1, observations: 1, anchors: 1, candidatesShown: 1 } };

beforeEach(() => {
  m.configured = true;
  m.runMapping.mockReset().mockResolvedValue(ok);
});

describe("mapComponents", () => {
  it("rejects a malformed id before doing anything", async () => {
    expect(await mapComponents("nope")).toEqual({ ok: false, error: "Invalid video." });
    expect(await mapComponents(5 as never)).toMatchObject({ ok: false });
    expect(m.runMapping).not.toHaveBeenCalled();
  });

  it("says how to set it up when there is no API key, without calling anything", async () => {
    m.configured = false;
    expect(await mapComponents(ID)).toMatchObject({ ok: false, error: expect.stringMatching(/ANTHROPIC_API_KEY/) });
    expect(m.runMapping).not.toHaveBeenCalled();
  });

  it("returns the result of a run", async () => {
    expect(await mapComponents(ID)).toEqual({ ok: true, result: ok });
  });

  it("shows a MappingError's message and hides anything else", async () => {
    m.runMapping.mockRejectedValueOnce(new MappingError("Analyze this video first."));
    expect(await mapComponents(ID)).toEqual({ ok: false, error: "Analyze this video first." });
    m.runMapping.mockRejectedValueOnce(new Error("connect ECONNRESET 10.0.0.1:5432"));
    const res = await mapComponents(ID);
    expect(res).toMatchObject({ ok: false });
    expect((res as { error: string }).error).not.toMatch(/ECONNRESET|5432/);
  });

  it("will not run the same video twice at once, nor two videos at once, and releases afterwards", async () => {
    let release!: () => void;
    m.runMapping.mockImplementationOnce(() => new Promise((r) => { release = () => r(ok); }));
    const first = mapComponents(ID);
    expect(await mapComponents(ID)).toMatchObject({ ok: false, error: expect.stringMatching(/already running/) });
    expect(await mapComponents(OTHER)).toMatchObject({ ok: false, error: expect.stringMatching(/Another mapping/) });
    release();
    expect(await first).toMatchObject({ ok: true });
    expect(await mapComponents(ID)).toMatchObject({ ok: true });
  });

  it("releases its slot even when the run fails", async () => {
    m.runMapping.mockRejectedValueOnce(new Error("x"));
    await mapComponents(ID);
    expect(await mapComponents(ID)).toMatchObject({ ok: true });
  });
});

describe("reviewComponentMapping", () => {
  const MAPPING = "33333333-3333-4333-8333-333333333333";

  beforeEach(() => m.reviewMapping.mockReset().mockResolvedValue({ basis: "read_quote" }));

  it("rejects malformed ids and notes before touching anything", async () => {
    expect(await reviewComponentMapping({ videoId: "nope", mappingId: MAPPING, decision: "confirmed" })).toEqual({ ok: false, error: "Invalid video." });
    expect(await reviewComponentMapping({ videoId: ID, mappingId: "nope", decision: "confirmed" })).toEqual({ ok: false, error: "Invalid mapping." });
    expect(await reviewComponentMapping({ videoId: ID, mappingId: MAPPING, decision: "confirmed", note: 5 as never })).toMatchObject({ ok: false });
    expect(await reviewComponentMapping(null as never)).toMatchObject({ ok: false });
    expect(m.reviewMapping).not.toHaveBeenCalled();
  });

  it("passes a decision through, treating anything but true as 'did not watch'", async () => {
    expect(await reviewComponentMapping({ videoId: ID, mappingId: MAPPING, decision: "confirmed", note: "ok", watchedVideo: "yes" as never })).toEqual({ ok: true });
    expect(m.reviewMapping).toHaveBeenCalledWith({ videoId: ID, mappingId: MAPPING, decision: "confirmed", note: "ok", watchedVideo: false });
    await reviewComponentMapping({ videoId: ID, mappingId: MAPPING, decision: "confirmed", watchedVideo: true });
    expect(m.reviewMapping.mock.calls[1][0].watchedVideo).toBe(true);
  });

  it("shows a MappingError's message (for example the 'watched the video' rule) and hides anything else", async () => {
    m.reviewMapping.mockRejectedValueOnce(new MappingError("Confirming this needs you to have watched the video."));
    expect(await reviewComponentMapping({ videoId: ID, mappingId: MAPPING, decision: "confirmed" })).toEqual({ ok: false, error: "Confirming this needs you to have watched the video." });
    m.reviewMapping.mockRejectedValueOnce(new Error("connect ECONNRESET 10.0.0.1:5432"));
    const res = await reviewComponentMapping({ videoId: ID, mappingId: MAPPING, decision: "rejected" });
    expect((res as { error: string }).error).not.toMatch(/ECONNRESET|5432/);
  });
});
