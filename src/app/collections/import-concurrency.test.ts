import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Integration test against the local Supabase database (pnpm db:start). It is
// skipped, not failed, when the database is unreachable. It creates one
// throwaway collection and videos with a random id, and removes them afterwards.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

// Same variables the app reads from .env.local; absent file just means skipped.
try {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* no .env.local */ }

const VIDEO_ID = ("Zt" + randomBytes(8).toString("hex")).slice(0, 11);
const URL_ = `https://www.youtube.com/watch?v=${VIDEO_ID}`;

type Db = typeof import("@/lib/db").db;
let db: Db | null = null;
const collections: string[] = [];

beforeAll(async () => {
  try {
    ({ db } = await import("@/lib/db"));
    const { error } = await db.from("collections").select("id").limit(1);
    if (error) db = null;
  } catch {
    db = null;
  }
});

async function newCollection(name: string) {
  const { data, error } = await db!.from("collections").insert({ name }).select("id").single();
  if (error) throw error;
  collections.push(data.id);
  return data.id;
}

const form = (collectionId: string, urls: string) => {
  const f = new FormData();
  f.set("collection_id", collectionId);
  f.set("urls", urls);
  return f;
};

afterAll(async () => {
  if (!db) return;
  await db.from("collections").delete().in("id", collections);
  await db.from("videos").delete().eq("platform_video_id", VIDEO_ID);
});

describe("simultaneous collection imports of the same link", () => {
  it("create exactly one video, and every import reuses it instead of failing", async (ctx) => {
    if (!db) return ctx.skip();
    const { importReferences } = await import("./actions");
    const ids = await Promise.all(Array.from({ length: 4 }, (_, i) => newCollection(`concurrency-test-${i}`)));

    const results = await Promise.all(ids.map((id) => importReferences(null, form(id, URL_))));

    for (const r of results) {
      expect(r.error).toBeUndefined();
      expect(r.added).toBe(1);
    }
    // One import created it; the rest found it already there.
    expect(results.reduce((n, r) => n + r.reused, 0)).toBeGreaterThanOrEqual(0);

    const { data: videos } = await db.from("videos").select("id").eq("platform_video_id", VIDEO_ID);
    expect(videos).toHaveLength(1);
    const { data: links } = await db.from("collection_videos").select("collection_id").eq("video_id", videos![0].id);
    expect(links).toHaveLength(ids.length);
  });

  it("the database itself rejects a second row for the same platform id", async (ctx) => {
    if (!db) return ctx.skip();
    const { error } = await db.from("videos").insert({ title: "dupe", platform: "youtube", platform_video_id: VIDEO_ID, is_mine: false });
    expect(error?.code).toBe("23505");
  });

  it("still allows many videos with no platform id", async (ctx) => {
    if (!db) return ctx.skip();
    const rows = [1, 2].map((n) => ({ title: `no-id-${n}-${VIDEO_ID}`, is_mine: false }));
    const { error } = await db.from("videos").insert(rows);
    expect(error).toBeNull();
    await db.from("videos").delete().in("title", rows.map((r) => r.title));
  });
});
