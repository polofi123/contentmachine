// Guards for endpoints that spend money or accept large uploads.
//
// This app has no login: it is a single-user tool meant to be reached only from
// the machine it runs on. These checks keep other web pages (cross-site and
// DNS-rebinding) and runaway loops from using it to burn API credit.

/** Hostnames the app may legitimately be served under. Extend with ALLOWED_HOSTS="a.local,b.local". */
function allowedHostnames(): Set<string> {
  const extra = (process.env.ALLOWED_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  return new Set(["localhost", "127.0.0.1", "[::1]", ...extra]);
}

/**
 * True only for a same-origin request to an allow-listed host, sent with the
 * app's own marker header. Comparing Origin to Host alone is not enough: a
 * DNS-rebinding page makes both equal an attacker's hostname, so the hostname
 * itself must be on the allow-list. The custom header cannot be sent
 * cross-origin without a CORS preflight, which this app never grants.
 */
export function isTrustedRequest(req: Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) return false;
  if (req.headers.get("x-requested-with") !== "contentmachine") return false;
  try {
    const o = new URL(origin);
    return o.host === host && allowedHostnames().has(o.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Thrown by limitBody's stream when more than the allowed bytes arrive. */
export class BodyTooLargeError extends Error {}

/**
 * Wraps a request body so it errors once more than `maxBytes` have been read,
 * whatever the Content-Length header claimed (or omitted). The body is never
 * buffered past the limit.
 */
export function limitBody(body: ReadableStream<Uint8Array>, maxBytes: number): ReadableStream<Uint8Array> {
  let seen = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > maxBytes) controller.error(new BodyTooLargeError());
        else controller.enqueue(chunk);
      },
    }),
  );
}

/** At most `limit` starts per `windowMs`, and at most `concurrent` in flight. In memory: one local process. */
export function createRunLimiter({ limit, windowMs, concurrent }: { limit: number; windowMs: number; concurrent: number }) {
  const starts: number[] = [];
  let inFlight = 0;
  return {
    /** Returns a release function, or the reason it was refused. */
    acquire(now = Date.now()): { ok: true; release: () => void } | { ok: false; reason: "busy" | "limit" } {
      while (starts.length && now - starts[0] > windowMs) starts.shift();
      if (inFlight >= concurrent) return { ok: false, reason: "busy" };
      if (starts.length >= limit) return { ok: false, reason: "limit" };
      starts.push(now);
      inFlight += 1;
      let released = false;
      return { ok: true, release: () => { if (!released) { released = true; inFlight -= 1; } } };
    },
  };
}
