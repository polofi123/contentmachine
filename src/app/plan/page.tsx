import Link from "next/link";
import { db } from "@/lib/db";
import { GoalBar, PillarMix, MonthGrid, Backlog } from "./plan-ui";

export const dynamic = "force-dynamic";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export default async function PlanPage({ searchParams }: PageProps<"/plan">) {
  const sp = await searchParams;
  const now = new Date();
  const raw = typeof sp.m === "string" ? sp.m : null;

  const year = raw ? Number(raw.slice(0, 4)) : now.getFullYear();
  const month = raw ? Number(raw.slice(5, 7)) : now.getMonth() + 1;
  const monthKey = iso(year, month, 1);

  const daysInMonth = new Date(year, month, 0).getDate();
  const monthEnd = iso(year, month, daysInMonth);

  const [{ data: goal }, { data: scheduled }, { data: mix }, { data: backlog }, { data: ideas }, { data: pillars }] =
    await Promise.all([
      db.from("plan_goals").select("month, target_posts, note").eq("month", monthKey).maybeSingle(),
      db
        .from("videos")
        .select("id, title, status, pillar, planned_publish_at")
        .eq("is_mine", true)
        .gte("planned_publish_at", monthKey)
        .lte("planned_publish_at", monthEnd)
        .order("planned_publish_at"),
      db.from("plan_pillar_mix").select("pillar, target_count, scheduled, published").eq("month", monthKey),
      db
        .from("videos")
        .select("id, title, status, pillar")
        .eq("is_mine", true)
        .is("planned_publish_at", null)
        .neq("status", "published")
        .order("created_at", { ascending: false })
        .limit(40),
      db
        .from("ideas")
        .select("id, title, niche")
        .eq("status", "captured")
        .order("created_at", { ascending: false })
        .limit(40),
      db.from("videos").select("pillar").not("pillar", "is", null),
    ]);

  const ids = (scheduled ?? []).map((v) => v.id);
  const { data: completeness } = ids.length
    ? await db.from("video_completeness").select("video_id, filled_slots, total_slots").in("video_id", ids)
    : { data: [] };

  const comp = new Map((completeness ?? []).map((c) => [c.video_id, c] as const));

  const entries = (scheduled ?? []).map((v) => {
    const c = comp.get(v.id);
    return {
      id: v.id,
      title: v.title,
      status: v.status,
      pillar: v.pillar,
      day: v.planned_publish_at as string,
      filled: c?.filled_slots ?? 0,
      total: c?.total_slots ?? 0,
    };
  });

  const knownPillars = Array.from(
    new Set([
      ...(pillars ?? []).map((p) => p.pillar as string),
      ...(mix ?? []).map((m) => m.pillar as string),
    ]),
  )
    .filter((p) => p && p !== "unassigned")
    .sort();

  const target = goal?.target_posts ?? daysInMonth;
  const published = entries.filter((e) => e.status === "published").length;

  // Pace is measured against the month's own clock: on the 10th of a 31-day
  // month with a target of 30, you should be about 9 posts in. Shown flat,
  // without judgement — it is a number, not a scolding.
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const dayOfMonth = isCurrentMonth ? today.getDate() : today > new Date(year, month, 0) ? daysInMonth : 0;
  const expectedByNow = Math.round((target * dayOfMonth) / daysInMonth);

  const prev = month === 1 ? iso(year - 1, 12, 1) : iso(year, month - 1, 1);
  const next = month === 12 ? iso(year + 1, 1, 1) : iso(year, month + 1, 1);
  const label = new Date(year, month - 1, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h1 className="text-xl font-medium tracking-tight text-ink">{label}</h1>
        <nav className="flex gap-2 text-xs text-ink-faint">
          <Link href={`/plan?m=${prev}`} className="hover:text-ink">
            ← prev
          </Link>
          <Link href="/plan" className="hover:text-ink">
            today
          </Link>
          <Link href={`/plan?m=${next}`} className="hover:text-ink">
            next →
          </Link>
        </nav>
      </header>

      <GoalBar
        month={monthKey}
        target={target}
        planned={entries.length}
        published={published}
        expectedByNow={expectedByNow}
        daysInMonth={daysInMonth}
        showPace={dayOfMonth > 0}
      />

      <PillarMix
        month={monthKey}
        rows={(mix ?? []).map((m) => ({
          pillar: m.pillar as string,
          target: m.target_count ?? 0,
          scheduled: m.scheduled ?? 0,
          published: m.published ?? 0,
        }))}
        knownPillars={knownPillars}
      />

      <MonthGrid
        year={year}
        month={month}
        daysInMonth={daysInMonth}
        entries={entries}
        knownPillars={knownPillars}
      />

      <Backlog
        videos={(backlog ?? []).map((v) => ({
          id: v.id,
          title: v.title,
          status: v.status,
          pillar: v.pillar,
        }))}
        ideas={(ideas ?? []).map((i) => ({ id: i.id, title: i.title, niche: i.niche }))}
        year={year}
        month={month}
        daysInMonth={daysInMonth}
      />
    </div>
  );
}
