import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { SlotCard, type SlotState } from "./slot-card";
import { Completeness } from "./completeness";
import { addSlot } from "./actions";
import {
  LegosBody,
  LoopBody,
  ComponentsBody,
  HookBody,
  ScriptBody,
  MetricsBody,
  type PickerComponent,
  type ScriptRow,
} from "./slot-bodies";

export const dynamic = "force-dynamic";

// Slots whose content is a component picker are entirely data-driven: the slot
// names a layer, and every non-archived component in that layer becomes an
// option. Adding a component to the library adds it here, with no code change.
const PLACEMENT_LAYERS = new Set(["hack", "checkpoint"]);

export default async function WorkbenchPage({ params }: PageProps<"/videos/[id]">) {
  const { id } = await params;

  const [
    { data: video },
    { data: videoSlots },
    { data: allSlots },
    { data: components },
    { data: chosen },
    { data: hooks },
    { data: bank },
    { data: scripts },
    { data: metrics },
  ] = await Promise.all([
    db.from("videos").select("*").eq("id", id).maybeSingle(),
    db.from("video_slots").select("slot_key, state").eq("video_id", id),
    db.from("slots").select("key, label, layer_id, description, sort_order").order("sort_order"),
    db
      .from("components")
      .select("id, source_id, layer_id, parent_id, name, body, is_placeholder, sort_order")
      .is("archived_at", null)
      .order("sort_order"),
    db.from("video_components").select("component_id, state, placement_sec, placement_note").eq("video_id", id),
    db.from("hooks").select("id, text, is_selected").eq("video_id", id).order("created_at"),
    db.from("hooks").select("id, text").is("video_id", null).order("created_at"),
    db
      .from("scripts")
      .select("id, name, format, duration_target_sec, edit_spec, script_beats(id, sort_order, t_start_sec, t_end_sec, function_label, text)")
      .eq("video_id", id)
      .order("created_at"),
    db
      .from("video_metrics")
      .select("measured_at, views, retention_pct")
      .eq("video_id", id)
      .order("measured_at", { ascending: false }),
  ]);

  if (!video) notFound();

  const hookIds = (hooks ?? []).map((h) => h.id);
  const { data: wordTags } = hookIds.length
    ? await db.from("hook_word_tags").select("hook_id, component_id").in("hook_id", hookIds)
    : { data: [] };

  const chosenMap = new Map((chosen ?? []).map((c) => [c.component_id, c] as const));
  const slotState = new Map((videoSlots ?? []).map((s) => [s.slot_key, s.state as SlotState]));

  const active = (allSlots ?? []).filter((s) => slotState.has(s.key));
  const available = (allSlots ?? []).filter((s) => !slotState.has(s.key));

  const forLayer = (layerId: string | null): PickerComponent[] =>
    (components ?? [])
      .filter((c) => c.layer_id === layerId && !c.parent_id)
      .map((c) => {
        const sel = chosenMap.get(c.id);
        return {
          id: c.id,
          source_id: c.source_id,
          name: c.name,
          body: c.body,
          is_placeholder: c.is_placeholder,
          state: (sel?.state as "used" | "skipped") ?? "none",
          placement_sec: sel?.placement_sec ?? null,
          placement_note: sel?.placement_note ?? null,
        };
      });

  const usedCount = (layerId: string | null) =>
    forLayer(layerId).filter((c) => c.state === "used").length;

  const scriptRows: ScriptRow[] = (scripts ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    format: s.format,
    duration_target_sec: s.duration_target_sec,
    edit_spec: s.edit_spec,
    beats: (s.script_beats ?? []).sort((a, b) => a.sort_order - b.sort_order),
  }));

  const hookRows = (hooks ?? []).map((h) => ({
    id: h.id,
    text: h.text,
    is_selected: h.is_selected,
    tags: (wordTags ?? []).filter((t) => t.hook_id === h.id).map((t) => t.component_id),
  }));

  const legoCount = [
    video.lego_topic,
    video.lego_angle,
    video.lego_hook,
    video.lego_story_structure,
    video.lego_visual_format,
    video.lego_key_visuals,
    video.lego_audio,
  ].filter(Boolean).length;

  const hookWordTypes = (components ?? [])
    .filter((c) => c.layer_id === "hook_word")
    .map((c) => ({ id: c.id, source_id: c.source_id, name: c.name }));

  const loopDetail =
    (components ?? []).find((c) => c.source_id === "PKG-02")?.body ?? null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6">
        <Link href="/videos" className="text-xs text-ink-faint hover:text-ink">
          ← videos
        </Link>
        <div className="mt-2 flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-medium tracking-tight text-ink">{video.title}</h1>
            <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-faint">
              <span>{video.is_mine ? video.status ?? "idea" : "outlier"}</span>
              {video.channel_name && <span>{video.channel_name}</span>}
              {video.loop_type && <span className="text-accent/70">{video.loop_type} loop</span>}
            </p>
          </div>
          {video.is_mine && (
            <Completeness
              videoId={id}
              slots={active.map((s) => ({
                key: s.key,
                label: s.label,
                state: slotState.get(s.key) ?? "empty",
              }))}
              available={available.map((s) => ({
                key: s.key,
                label: s.label,
                description: s.description,
              }))}
            />
          )}
        </div>
      </div>

      {video.is_mine && active.length === 0 && (
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
          <p className="text-sm text-ink-dim">This build has no slots yet.</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-ink-faint">
            Slots are the completeness denominator — pick only what this video actually needs, so
            a three-piece build reads 3/3.
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {available.map((s) => (
              <form key={s.key} action={addSlot}>
                <input type="hidden" name="video_id" value={id} />
                <input type="hidden" name="slot_key" value={s.key} />
                <button
                  type="submit"
                  title={s.description ?? undefined}
                  className="rounded border border-border px-2 py-1 text-[11px] text-ink-faint transition-colors hover:border-accent-dim hover:text-accent"
                >
                  + {s.label}
                </button>
              </form>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2.5">
        {active.map((slot) => {
          const state = slotState.get(slot.key) ?? "empty";
          const common = {
            videoId: id,
            slotKey: slot.key,
            label: slot.label,
            description: slot.description,
            state,
          };

          if (slot.key === "legos") {
            return (
              <SlotCard
                key={slot.key}
                {...common}
                summary={
                  legoCount > 0
                    ? `${legoCount} of 7 described`
                    : video.notes
                      ? "notes, not sorted yet"
                      : null
                }
              >
                <LegosBody videoId={id} video={video} notes={video.notes} />
              </SlotCard>
            );
          }

          if (slot.key === "loop_type") {
            return (
              <SlotCard key={slot.key} {...common} summary={video.loop_type}>
                <LoopBody videoId={id} current={video.loop_type} detail={loopDetail} />
              </SlotCard>
            );
          }

          if (slot.key === "hook") {
            const selected = hookRows.find((h) => h.is_selected);
            return (
              <SlotCard
                key={slot.key}
                {...common}
                summary={selected?.text ?? (hookRows.length ? `${hookRows.length} candidates` : null)}
              >
                <HookBody
                  videoId={id}
                  hooks={hookRows}
                  wordTypes={hookWordTypes}
                  bank={bank ?? []}
                />
              </SlotCard>
            );
          }

          if (slot.key === "script") {
            const beats = scriptRows.reduce((n, s) => n + s.beats.length, 0);
            return (
              <SlotCard
                key={slot.key}
                {...common}
                summary={scriptRows.length ? `${scriptRows.length} cuts, ${beats} beats` : null}
              >
                <ScriptBody videoId={id} scripts={scriptRows} />
              </SlotCard>
            );
          }

          // Everything else is a component picker driven by the slot's layer.
          const n = usedCount(slot.layer_id);
          return (
            <SlotCard key={slot.key} {...common} summary={n > 0 ? `${n} planted` : null}>
              <ComponentsBody
                videoId={id}
                slotKey={slot.key}
                components={forLayer(slot.layer_id)}
                showPlacement={PLACEMENT_LAYERS.has(slot.layer_id ?? "")}
              />
            </SlotCard>
          );
        })}
      </div>

      {video.is_mine && (
        <section className="mt-8 rounded-xl border border-border-soft bg-surface px-4 py-3">
          <h2 className="mb-2 text-sm text-ink">Performance</h2>
          <MetricsBody videoId={id} history={metrics ?? []} />
        </section>
      )}

      {!video.is_mine && (
        <section className="mt-8 rounded-xl border border-border-soft bg-surface px-4 py-3">
          <h2 className="mb-2 text-sm text-ink">Numbers</h2>
          <MetricsBody videoId={id} history={metrics ?? []} />
        </section>
      )}
    </div>
  );
}
