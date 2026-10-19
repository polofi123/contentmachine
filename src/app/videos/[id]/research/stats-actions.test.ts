import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  video: null as Record<string, unknown> | null,
  insert: vi.fn(),
  update: vi.fn(),
  fetchVideos: vi.fn(),
  fetchAvg: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    from: (table: string) =>
      table === "videos"
        ? {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: m.video, error: null }) }) }),
            update: (v: unknown) => ({ eq: async () => (m.update(v), { error: null }) }),
          }
        : { insert: async (v: unknown) => (m.insert(v), { error: null }) },
  },
}));
vi.mock("@/lib/youtube-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/youtube-api")>("@/lib/youtube-api");
  return { ...actual, fetchVideos: m.fetchVideos, fetchChannelAverageViews: m.fetchAvg };
});

import { YouTubeApiError } from "@/lib/youtube-api";
import { refreshYouTubeStats } from "./stats-actions";

const ID = "11111111-1111-4111-8111-111111111111";
const yt = {
  videoId: "abcdefghijk", title: "Real Title", channelId: "UC1234567890abcdef", channelTitle: "Real Channel",
  publishedAt: "2026-03-04T00:00:00Z", durationSec: 60, thumbnail: "https://i.ytimg.com/x.jpg", views: 5000, likes: 100, comments: 7,
};
const row = (over: Record<string, unknown> = {}) => ({
  id: ID, url: "https://www.youtube.com/watch?v=abcdefghijk", title: "YouTube reference · abcdefghijk",
  channel_name: null, published_at: null, thumbnail_url: null, channel_avg_views: null, ...over,
});

beforeEach(() => {
  m.video = row();
  m.insert.mockReset();
  m.update.mockReset();
  m.fetchVideos.mockReset().mockResolvedValue(new Map([["abcdefghijk", yt]]));
  m.fetchAvg.mockReset().mockResolvedValue({ average: 1000, sampled: 20 });
});

describe("refreshYouTubeStats", () => {
  it("adds a metrics snapshot and fills empty details, including the placeholder title", async () => {
    const res = await refreshYouTubeStats(ID);
    expect(res).toMatchObject({ ok: true, views: 5000, likes: 100, comments: 7, outlier: 5 });
    expect(m.insert).toHaveBeenCalledWith({ video_id: ID, views: 5000, likes: 100, comments: 7, note: "YouTube Data API" });
    expect(m.update).toHaveBeenCalledWith({
      channel_name: "Real Channel", published_at: "2026-03-04T00:00:00Z", thumbnail_url: "https://i.ytimg.com/x.jpg",
      channel_avg_views: 1000, title: "Real Title",
    });
  });

  it("never overwrites details you already have, nor a title you wrote", async () => {
    m.video = row({ title: "My own title", channel_name: "Mine", published_at: "2020-01-01T00:00:00Z", thumbnail_url: "t", channel_avg_views: 2500 });
    const res = await refreshYouTubeStats(ID);
    expect(res).toMatchObject({ ok: true, outlier: 2 });
    expect(m.update).not.toHaveBeenCalled();
    expect(m.fetchAvg).not.toHaveBeenCalled();
    expect(m.insert).toHaveBeenCalledTimes(1);
  });

  it("explains when a channel is too small for an outlier score instead of inventing one", async () => {
    m.fetchAvg.mockResolvedValue({ average: null, sampled: 1 });
    const res = await refreshYouTubeStats(ID);
    expect(res).toMatchObject({ ok: true, outlier: null });
    expect(res.ok && res.note).toMatch(/Not enough recent uploads/);
    expect(m.update.mock.calls[0][0]).not.toHaveProperty("channel_avg_views");
  });

  it("refuses non-YouTube videos before calling the API", async () => {
    m.video = row({ url: "https://www.tiktok.com/@a/video/7234567890123456789" });
    expect(await refreshYouTubeStats(ID)).toMatchObject({ ok: false });
    expect(m.fetchVideos).not.toHaveBeenCalled();
  });

  it("handles a private or deleted video without saving anything", async () => {
    m.fetchVideos.mockResolvedValue(new Map());
    expect(await refreshYouTubeStats(ID)).toMatchObject({ ok: false, error: expect.stringMatching(/private or deleted/) });
    expect(m.insert).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
  });

  it("returns API problems as friendly errors and saves nothing", async () => {
    m.fetchVideos.mockRejectedValue(new YouTubeApiError("quota", "The YouTube API daily quota is used up."));
    expect(await refreshYouTubeStats(ID)).toEqual({ ok: false, error: "The YouTube API daily quota is used up." });
    expect(m.insert).not.toHaveBeenCalled();
  });

  it("does not leak unexpected errors", async () => {
    m.fetchVideos.mockRejectedValue(new Error("secret internals"));
    const res = await refreshYouTubeStats(ID);
    expect(res.ok === false && res.error).not.toContain("secret");
  });

  it("rejects an invalid id and a missing video", async () => {
    expect(await refreshYouTubeStats("nope")).toMatchObject({ ok: false });
    m.video = null;
    expect(await refreshYouTubeStats(ID)).toMatchObject({ ok: false, error: "Video not found." });
  });
});
