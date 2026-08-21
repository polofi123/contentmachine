import { db } from "@/lib/db";
import { SlotCard, type SlotState } from "./slot-card";
import {
  LegosBody,
  LoopBody,
  ComponentsBody,
  HookBody,
  ScriptBody,
  type PickerComponent,
  type ScriptRow,
} from "./slot-bodies";

// Hacks and checkpoints record WHERE they landed, so their pickers offer a
// placement. Everywhere else a placement box would just be an empty field.
const PLACEMENT_LAYERS = new Set(["hack", "checkpoint"]);

export type StackSlot = {
  key: string;
  label: string;
  layer_id: string | null;
  description: string | null;
};

/**
 * The workbench cards, rendered once for everyone who needs them.
 *
 * MAKE shows its own subset beneath the outliner and outliers show the lot;
 * having two copies of this switch is how the two screens quietly stop
 * agreeing about what a slot looks like.
 */
export async function SlotStack({
  videoId,
  slots,
  slotState,
  hideAngleInLegos = false,
}: {
  videoId: string;
  slots: StackSlot[];
  slotState: Map<string, string>;
  hideAngleInLegos?: boolean;
}) {
  if (slots.length === 0) return null;

  const [
    { data: video },
    { data: components },
    { data: chosen },
    { data: hooks },
    { data: bank },
    { data: scripts },
  ] = await Promise.all([
    db.from("videos").select("*").eq("id", videoId).maybeSingle(),
    db
      .from("components")
      .select("id, source_id, layer_id, parent_id, name, body, is_placeholder, sort_order")
      .is("archived_at", null)
      .order("sort_order"),
    db
      .from("video_components")
      .select("component_id, state, placement_sec, placement_note")
      .eq("video_id", videoId),
    db.from("hooks").select("id, text, is_selected").eq("video_id", videoId).order("created_at"),
    db.from("hooks").select("id, text").is("video_id", null).order("created_at"),
    db
      .from("scripts")
      .select(
        "id, name, format, duration_target_sec, edit_spec, script_beats(id, sort_order, t_start_sec, t_end_sec, function_label, text)",
      )
      .eq("video_id", videoId)
      .order("created_at"),
  ]);

  if (!video) return null;

  const hookIds = (hooks ?? []).map((h) => h.id);
  const { data: wordTags } = hookIds.length
    ? await db.from("hook_word_tags").select("hook_id, component_id").in("hook_id", hookIds)
    : { data: [] };

  const chosenMap = new Map((chosen ?? []).map((c) => [c.component_id, c] as const));

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

  const loopDetail = (components ?? []).find((c) => c.source_id === "PKG-02")?.body ?? null;

  return (
    <div className="space-y-2.5">
      {slots.map((slot) => {
        const state = (slotState.get(slot.key) ?? "empty") as SlotState;
        const common = {
          videoId,
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
              <LegosBody
                videoId={videoId}
                video={video}
                notes={video.notes}
                hideAngle={hideAngleInLegos}
              />
            </SlotCard>
          );
        }

        if (slot.key === "loop_type") {
          return (
            <SlotCard key={slot.key} {...common} summary={video.loop_type}>
              <LoopBody videoId={videoId} current={video.loop_type} detail={loopDetail} />
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
                videoId={videoId}
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
              <ScriptBody videoId={videoId} scripts={scriptRows} />
            </SlotCard>
          );
        }

        const n = forLayer(slot.layer_id).filter((c) => c.state === "used").length;
        return (
          <SlotCard key={slot.key} {...common} summary={n > 0 ? `${n} planted` : null}>
            <ComponentsBody
              videoId={videoId}
              slotKey={slot.key}
              components={forLayer(slot.layer_id)}
              showPlacement={PLACEMENT_LAYERS.has(slot.layer_id ?? "")}
            />
          </SlotCard>
        );
      })}
    </div>
  );
}
