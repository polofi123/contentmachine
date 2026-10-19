// Reading a platform and a video id back out of a pasted URL.
//
// `videos.platform_video_id` exists so a read-only view fetch is a small
// drop-in later (see the README's known limitation). That only holds if the id
// is actually there, and asking someone to find it by hand right after they
// pasted the URL containing it is how a column stays empty forever.
//
// Deliberately parsing-only — no network. A vm.tiktok.com short link cannot be
// resolved without following it, so it returns null rather than a guess.

export type Platform = "youtube" | "tiktok" | "instagram" | "other";

const PLATFORMS: readonly Platform[] = ["youtube", "tiktok", "instagram", "other"];

/** Narrows a posted string to the platform CHECK constraint, or null. */
export function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

function parse(url: string | null): URL | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url.trim());
  } catch {
    return null;
  }
}

// The domain itself or a subdomain of it — a bare endsWith would also accept
// "notyoutube.com".
function onDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Which platform a URL points at, or null when it is not one we know. */
export function platformFromUrl(url: string | null): Platform | null {
  const host = parse(url)?.hostname.toLowerCase().replace(/^www\./, "");
  if (!host) return null;

  if (host === "youtu.be" || onDomain(host, "youtube.com")) return "youtube";
  if (onDomain(host, "tiktok.com")) return "tiktok";
  if (onDomain(host, "instagram.com")) return "instagram";
  return null;
}

/** The platform's own id for the video, dug out of the URL. */
export function platformVideoId(url: string | null): string | null {
  const u = parse(url);
  if (!u) return null;

  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const path = u.pathname;

  if (host === "youtu.be") return path.slice(1).split("/")[0] || null;

  if (onDomain(host, "youtube.com")) {
    // /watch?v=ID for the long form, /shorts/ID and /live/ID for the rest.
    return u.searchParams.get("v") || path.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/)?.[1] || null;
  }

  if (onDomain(host, "tiktok.com")) return path.match(/\/video\/(\d+)/)?.[1] ?? null;

  // Instagram's shortcode is the id everything else keys off.
  if (onDomain(host, "instagram.com")) return path.match(/\/(?:reels?|p|tv)\/([^/?#]+)/)?.[1] ?? null;

  return null;
}

export type VideoLink = {
  url: string;
  platform: Exclude<Platform, "other">;
  videoId: string | null;
};

const TRACKING_PARAMS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "fbclid", "igshid", "igsh", "si", "is_from_webapp", "sender_device",
];

/**
 * A pasted link cleaned into something worth storing, or null when it is not a
 * YouTube, TikTok or Instagram URL. A missing scheme is forgiven — people copy
 * "youtube.com/shorts/…" out of address bars all the time.
 */
export function normalizeVideoUrl(raw: string): VideoLink | null {
  const text = raw.trim();
  if (!text) return null;
  const u = parse(/^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  if (!u || (u.protocol !== "https:" && u.protocol !== "http:")) return null;

  const platform = platformFromUrl(u.toString());
  if (!platform || platform === "other") return null;

  u.protocol = "https:";
  u.hash = "";
  for (const key of TRACKING_PARAMS) u.searchParams.delete(key);
  const url = u.toString();
  return { url, platform, videoId: platformVideoId(url) };
}

/**
 * What makes two links the same video: the platform's own id when the URL
 * carries one, the cleaned URL when it does not (short links, profile pages).
 */
export function videoKey(link: VideoLink): string {
  return link.videoId ? `${link.platform}:${link.videoId}` : link.url;
}

/**
 * The platform's own embeddable player for a stored URL, or null when the URL
 * carries no video id (short links, profile pages). Derived from the URL rather
 * than the platform column, which hand-logged rows do not always get right.
 */
export function embedUrl(url: string | null, autoplay = false): string | null {
  const link = url ? normalizeVideoUrl(url) : null;
  if (!link?.videoId) return null;
  const id = encodeURIComponent(link.videoId);
  const auto = autoplay ? "1" : "0";

  if (link.platform === "youtube") return `https://www.youtube.com/embed/${id}?autoplay=${auto}&rel=0`;
  if (link.platform === "tiktok") return `https://www.tiktok.com/player/v1/${id}?autoplay=${auto}&rel=0&description=1`;
  // Instagram's embed has no autoplay switch; /p/ serves reels and posts alike.
  return `https://www.instagram.com/p/${id}/embed/`;
}

/**
 * A still that can be had from the id alone. Only YouTube publishes one at a
 * predictable address; TikTok and Instagram need a network lookup, so null.
 */
export function thumbnailFor(link: VideoLink): string | null {
  return link.platform === "youtube" && link.videoId
    ? `https://i.ytimg.com/vi/${encodeURIComponent(link.videoId)}/hqdefault.jpg`
    : null;
}

/** Links pasted one per line, comma-separated, or any mix of the two. */
export function splitLinks(text: string): string[] {
  return text.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
}
