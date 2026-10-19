import { afterEach, describe, expect, it, vi } from "vitest";
import { BodyTooLargeError, createRunLimiter, isTrustedRequest, limitBody } from "./request-guard";

const req = (headers: Record<string, string>) => new Request("http://localhost:3000/x", { method: "POST", headers });
const ok = { origin: "http://localhost:3000", host: "localhost:3000", "x-requested-with": "contentmachine" };

afterEach(() => vi.unstubAllEnvs());

describe("isTrustedRequest", () => {
  it("accepts same-origin requests to localhost with the marker header", () => {
    expect(isTrustedRequest(req(ok))).toBe(true);
    expect(isTrustedRequest(req({ ...ok, origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" }))).toBe(true);
  });

  it("rejects cross-site, rebinding, missing-header and malformed cases", () => {
    expect(isTrustedRequest(req({ ...ok, origin: "https://evil.example" }))).toBe(false);
    expect(isTrustedRequest(req({ ...ok, origin: "http://evil.example", host: "evil.example" }))).toBe(false);
    expect(isTrustedRequest(req({ ...ok, "x-requested-with": "XMLHttpRequest" }))).toBe(false);
    expect(isTrustedRequest(req({ ...ok, origin: "not a url" }))).toBe(false);
    expect(isTrustedRequest(req({ host: "localhost:3000", "x-requested-with": "contentmachine" }))).toBe(false);
  });

  it("honours ALLOWED_HOSTS for a deliberate extra hostname", () => {
    const h = { ...ok, origin: "http://studio.local:3000", host: "studio.local:3000" };
    expect(isTrustedRequest(req(h))).toBe(false);
    vi.stubEnv("ALLOWED_HOSTS", "studio.local");
    expect(isTrustedRequest(req(h))).toBe(true);
  });
});

describe("limitBody", () => {
  const stream = (chunks: number[]) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        for (const n of chunks) c.enqueue(new Uint8Array(n));
        c.close();
      },
    });
  const drain = async (s: ReadableStream<Uint8Array>) => {
    let total = 0;
    const reader = s.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return total;
      total += value.byteLength;
    }
  };

  it("passes a body within the limit", async () => {
    expect(await drain(limitBody(stream([400, 600]), 1000))).toBe(1000);
  });

  it("errors as soon as the limit is exceeded, whatever was declared", async () => {
    await expect(drain(limitBody(stream([600, 600]), 1000))).rejects.toBeInstanceOf(BodyTooLargeError);
  });
});

describe("createRunLimiter", () => {
  it("caps concurrency and releases slots", () => {
    const l = createRunLimiter({ limit: 100, windowMs: 1000, concurrent: 1 });
    const a = l.acquire();
    expect(a.ok).toBe(true);
    expect(l.acquire()).toEqual({ ok: false, reason: "busy" });
    if (a.ok) {
      a.release();
      a.release();
    }
    expect(l.acquire().ok).toBe(true);
  });

  it("caps starts per window and recovers after it", () => {
    const l = createRunLimiter({ limit: 2, windowMs: 1000, concurrent: 10 });
    expect(l.acquire(0).ok && l.acquire(10).ok).toBe(true);
    expect(l.acquire(20)).toEqual({ ok: false, reason: "limit" });
    expect(l.acquire(1100).ok).toBe(true);
  });
});
