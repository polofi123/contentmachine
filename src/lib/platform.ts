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

/** Which platform a URL points at, or null when it is not one we know. */
export function platformFromUrl(url: string | null): Platform | null {
  const host = parse(url)?.hostname.replace(/^www\./, "");
  if (!host) return null;

  if (host === "youtu.be" || host.endsWith("youtube.com")) return "youtube";
  if (host.endsWith("tiktok.com")) return "tiktok";
  if (host.endsWith("instagram.com")) return "instagram";
  return null;
}

/** The platform's own id for the video, dug out of the URL. */
export function platformVideoId(url: string | null): string | null {
  const u = parse(url);
  if (!u) return null;

  const host = u.hostname.replace(/^www\./, "");
  const path = u.pathname;

  if (host === "youtu.be") return path.slice(1).split("/")[0] || null;

  if (host.endsWith("youtube.com")) {
    // /watch?v=ID for the long form, /shorts/ID and /live/ID for the rest.
    return u.searchParams.get("v") ?? path.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/)?.[1] ?? null;
  }

  if (host.endsWith("tiktok.com")) return path.match(/\/video\/(\d+)/)?.[1] ?? null;

  // Instagram's shortcode is the id everything else keys off.
  if (host.endsWith("instagram.com")) return path.match(/\/(?:reels?|p|tv)\/([^/?#]+)/)?.[1] ?? null;

  return null;
}
