// Official YouTube Data API v3 client: public statistics for saved YouTube
// references. Server-only, key from YOUTUBE_API_KEY, no scraping.
//
// Quota: every call below costs 1 unit of the default 10,000/day. Refreshing one
// video's stats plus its channel average is 4 units.

const BASE = "https://www.googleapis.com/youtube/v3";

export const youtubeConfigured = () => Boolean(process.env.YOUTUBE_API_KEY?.trim());

export type YouTubeErrorCode = "not_configured" | "invalid_key" | "not_enabled" | "quota" | "not_found" | "failed";

/** An error whose message is safe to show the user: never contains the key or raw API text. */
export class YouTubeApiError extends Error {
  constructor(public code: YouTubeErrorCode, message: string) {
    super(message);
    this.name = "YouTubeApiError";
  }
}

export type YouTubeVideo = {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  durationSec: number | null;
  thumbnail: string | null;
  views: number | null;
  /** null when the creator hides likes or the field is absent. */
  likes: number | null;
  /** null when comments are disabled. */
  comments: number | null;
};

type ApiBody = {
  items?: Record<string, unknown>[];
  error?: { code?: number; errors?: { reason?: string }[]; message?: string };
};

async function get(path: string, params: Record<string, string>): Promise<ApiBody> {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key) throw new YouTubeApiError("not_configured", "YouTube stats are not set up: add YOUTUBE_API_KEY to .env.local and restart the server.");

  let res: Response;
  try {
    // The key travels in a header, so it never appears in a URL, log or error.
    res = await fetch(`${BASE}/${path}?${new URLSearchParams(params)}`, {
      headers: { "x-goog-api-key": key },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    throw new YouTubeApiError("failed", "Could not reach YouTube. Check your connection and try again.");
  }

  const body = (await res.json().catch(() => ({}))) as ApiBody;
  if (res.ok) return body;

  const reasons = (body.error?.errors ?? []).map((e) => e.reason ?? "");
  const message = (body.error?.message ?? "").toLowerCase();
  if (reasons.some((r) => ["quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded", "userRateLimitExceeded"].includes(r))) {
    throw new YouTubeApiError("quota", "The YouTube API daily quota is used up. It resets at midnight Pacific time.");
  }
  if (reasons.includes("accessNotConfigured") || message.includes("has not been used") || message.includes("is disabled")) {
    throw new YouTubeApiError("not_enabled", "The YouTube Data API v3 is not enabled for this key's Google Cloud project. Enable it in the API library and retry.");
  }
  if (res.status === 400 && (reasons.includes("keyInvalid") || message.includes("api key"))) {
    throw new YouTubeApiError("invalid_key", "YouTube rejected the API key. Check YOUTUBE_API_KEY in .env.local.");
  }
  if (res.status === 403) {
    throw new YouTubeApiError("invalid_key", "YouTube refused this key (it may be restricted to other APIs or referrers).");
  }
  if (res.status === 404) throw new YouTubeApiError("not_found", "YouTube could not find that item.");
  throw new YouTubeApiError("failed", "YouTube had a problem. Try again in a moment.");
}

const count = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
};

/** ISO 8601 duration ("PT1M14S", "PT1H2M3S") to seconds. */
export function parseIsoDuration(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = v.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  if (!m || v === "P" || v === "PT") return null;
  return Math.round((+(m[1] ?? 0)) * 86400 + (+(m[2] ?? 0)) * 3600 + (+(m[3] ?? 0)) * 60 + +(m[4] ?? 0));
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** Up to 50 videos in one call (1 quota unit). Ids YouTube does not return (private, deleted) are simply absent. */
export async function fetchVideos(ids: string[]): Promise<Map<string, YouTubeVideo>> {
  const unique = [...new Set(ids)].filter((id) => /^[\w-]{6,20}$/.test(id));
  if (unique.length === 0) return new Map();
  if (unique.length > 50) throw new YouTubeApiError("failed", "At most 50 videos can be requested at once.");

  const body = await get("videos", { part: "snippet,contentDetails,statistics", id: unique.join(","), maxResults: "50" });
  const out = new Map<string, YouTubeVideo>();
  for (const item of body.items ?? []) {
    const id = typeof item.id === "string" ? item.id : null;
    if (!id) continue;
    const snippet = obj(item.snippet);
    const stats = obj(item.statistics);
    const thumbs = obj(snippet.thumbnails);
    out.set(id, {
      videoId: id,
      title: typeof snippet.title === "string" ? snippet.title : "",
      channelId: typeof snippet.channelId === "string" ? snippet.channelId : "",
      channelTitle: typeof snippet.channelTitle === "string" ? snippet.channelTitle : "",
      publishedAt: typeof snippet.publishedAt === "string" ? snippet.publishedAt : "",
      durationSec: parseIsoDuration(obj(item.contentDetails).duration),
      thumbnail: typeof obj(thumbs.high).url === "string" ? (obj(thumbs.high).url as string) : null,
      views: count(stats.viewCount),
      likes: count(stats.likeCount),
      comments: count(stats.commentCount),
    });
  }
  return out;
}

/**
 * Average views of a channel's most recent uploads, the denominator of the
 * outlier score. Excludes the video being scored and needs at least 3 others,
 * so a brand-new channel gets no score rather than a meaningless one.
 * Costs 3 quota units.
 */
export async function fetchChannelAverageViews(
  channelId: string,
  excludeVideoId?: string,
  sample = 20,
): Promise<{ average: number | null; sampled: number }> {
  if (!/^[\w-]{10,40}$/.test(channelId)) return { average: null, sampled: 0 };

  const ch = await get("channels", { part: "contentDetails", id: channelId });
  const uploads = obj(obj(obj(ch.items?.[0]).contentDetails).relatedPlaylists).uploads;
  if (typeof uploads !== "string") return { average: null, sampled: 0 };

  const list = await get("playlistItems", { part: "contentDetails", playlistId: uploads, maxResults: String(Math.min(50, sample + 5)) });
  const ids = (list.items ?? [])
    .map((i) => obj(i.contentDetails).videoId)
    .filter((id): id is string => typeof id === "string" && id !== excludeVideoId)
    .slice(0, sample);
  if (ids.length === 0) return { average: null, sampled: 0 };

  const stats = await get("videos", { part: "statistics", id: ids.join(","), maxResults: "50" });
  const views = (stats.items ?? []).map((i) => count(obj(i.statistics).viewCount)).filter((v): v is number => v !== null);
  if (views.length < 3) return { average: null, sampled: views.length };
  return { average: Math.round(views.reduce((a, b) => a + b, 0) / views.length), sampled: views.length };
}
