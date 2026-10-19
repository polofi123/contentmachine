import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchChannelAverageViews, fetchVideos, parseIsoDuration, youtubeConfigured, YouTubeApiError } from "./youtube-api";

const fetchMock = vi.fn();
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const video = (id: string, stats: Record<string, string> = { viewCount: "1000", likeCount: "50", commentCount: "5" }) => ({
  id,
  snippet: { title: `Title ${id}`, channelId: "UC1234567890abcdef", channelTitle: "Chan", publishedAt: "2026-01-02T03:04:05Z", thumbnails: { high: { url: `https://i.ytimg.com/vi/${id}/hq.jpg` } } },
  contentDetails: { duration: "PT1M14S" },
  statistics: stats,
});

beforeEach(() => {
  vi.stubEnv("YOUTUBE_API_KEY", "yt-test-key-not-real");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("parseIsoDuration", () => {
  it("parses common shapes", () => {
    expect(parseIsoDuration("PT1M14S")).toBe(74);
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("PT45S")).toBe(45);
    expect(parseIsoDuration("P1DT1H")).toBe(90000);
  });
  it("rejects junk", () => {
    for (const bad of ["", "PT", "P", "1:14", null, 74]) expect(parseIsoDuration(bad)).toBeNull();
  });
});

describe("fetchVideos", () => {
  it("maps statistics, snippet and duration", async () => {
    fetchMock.mockResolvedValue(json(200, { items: [video("abcdefghijk")] }));
    const m = await fetchVideos(["abcdefghijk"]);
    expect(m.get("abcdefghijk")).toMatchObject({
      title: "Title abcdefghijk", channelTitle: "Chan", durationSec: 74, views: 1000, likes: 50, comments: 5,
      publishedAt: "2026-01-02T03:04:05Z", thumbnail: "https://i.ytimg.com/vi/abcdefghijk/hq.jpg",
    });
  });

  it("sends the key in a header, never in the URL", async () => {
    fetchMock.mockResolvedValue(json(200, { items: [] }));
    await fetchVideos(["abcdefghijk"]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain("yt-test-key-not-real");
    expect(String(url)).toContain("id=abcdefghijk");
    expect(init.headers["x-goog-api-key"]).toBe("yt-test-key-not-real");
  });

  it("reports hidden likes and disabled comments as null, not zero", async () => {
    fetchMock.mockResolvedValue(json(200, { items: [video("abcdefghijk", { viewCount: "10" })] }));
    expect((await fetchVideos(["abcdefghijk"])).get("abcdefghijk")).toMatchObject({ views: 10, likes: null, comments: null });
  });

  it("omits videos YouTube does not return, and ignores malformed ids without calling the API", async () => {
    fetchMock.mockResolvedValue(json(200, { items: [] }));
    expect((await fetchVideos(["abcdefghijk"])).size).toBe(0);
    fetchMock.mockClear();
    expect((await fetchVideos(["../etc", "a b", ""])).size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses more than 50 ids", async () => {
    await expect(fetchVideos(Array.from({ length: 51 }, (_, i) => `video${String(i).padStart(6, "0")}`))).rejects.toBeInstanceOf(YouTubeApiError);
  });
});

describe("error handling", () => {
  const call = () => fetchVideos(["abcdefghijk"]);
  const err = (status: number, reason: string, message = "x") => json(status, { error: { code: status, message, errors: [{ reason }] } });

  it("needs a key and makes no request without one", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", " ");
    expect(youtubeConfigured()).toBe(false);
    await expect(call()).rejects.toMatchObject({ code: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [403, "quotaExceeded", "quota"],
    [403, "dailyLimitExceeded", "quota"],
    [403, "accessNotConfigured", "not_enabled"],
    [400, "keyInvalid", "invalid_key"],
    [403, "forbidden", "invalid_key"],
    [404, "notFound", "not_found"],
    [500, "backendError", "failed"],
  ])("maps HTTP %i %s to %s", async (status, reason, code) => {
    fetchMock.mockResolvedValue(err(status, reason));
    await expect(call()).rejects.toMatchObject({ code });
  });

  it("never echoes raw API text or the key", async () => {
    fetchMock.mockResolvedValue(err(500, "backendError", "internal: yt-test-key-not-real leaked"));
    const e = await call().catch((x) => x);
    expect(e.message).not.toContain("yt-test-key-not-real");
    expect(e.message).not.toContain("internal");
  });

  it("handles network failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(call()).rejects.toMatchObject({ code: "failed" });
  });
});

describe("fetchChannelAverageViews", () => {
  const CH = "UC1234567890abcdef";
  const stage = (viewCounts: string[], ids = viewCounts.map((_, i) => `vid${String(i).padStart(8, "0")}`)) => {
    fetchMock
      .mockResolvedValueOnce(json(200, { items: [{ contentDetails: { relatedPlaylists: { uploads: "UU123" } } }] }))
      .mockResolvedValueOnce(json(200, { items: ids.map((videoId) => ({ contentDetails: { videoId } })) }))
      .mockResolvedValueOnce(json(200, { items: viewCounts.map((viewCount) => ({ statistics: { viewCount } })) }));
  };

  it("averages recent uploads", async () => {
    stage(["100", "200", "300", "400"]);
    expect(await fetchChannelAverageViews(CH, "exclude-me-1")).toEqual({ average: 250, sampled: 4 });
  });

  it("excludes the video being scored from the sample", async () => {
    stage(["10", "20", "30", "40"], ["vidAAAAAAAA", "vidBBBBBBBB", "vidCCCCCCCC", "target12345"]);
    await fetchChannelAverageViews(CH, "target12345");
    const statsCall = String(fetchMock.mock.calls[2][0]);
    expect(statsCall).not.toContain("target12345");
    expect(statsCall).toContain("vidAAAAAAAA");
  });

  it("gives no average for a channel with fewer than three other videos", async () => {
    stage(["100", "200"]);
    expect(await fetchChannelAverageViews(CH)).toEqual({ average: null, sampled: 2 });
  });

  it("does not call the API for a malformed channel id", async () => {
    expect(await fetchChannelAverageViews("../bad")).toEqual({ average: null, sampled: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
