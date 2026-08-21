import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { loadScript, loadSlots, running } from "../data";
import { SlotStack } from "../slot-stack";
import { Workspace, type WorkspaceBeat } from "./workspace";
import type { PileItem } from "./pile";
import type { PaletteComponent } from "./palette";
import type { TrayComponent } from "./tray";

export const dynamic = "force-dynamic";

// MAKE answers: what am I saying, in what order, and why should anyone keep
// watching? Editing decisions live next door and are deliberately not on this
// screen — nobody should be looking at b-roll controls while trying to finish a
// sentence.
export default async function MakePage({ params }: PageProps<"/videos/[id]/make">) {
  const { id } = await params;

  const [{ data: video }, script, slots, { data: hooks }, { data: bank }, { data: ideas }, { data: components }, { data: layers }, { data: chosen }] =
    await Promise.all([
      db.from("videos").select("id, lego_angle").eq("id", id).maybeSingle(),
      loadScript(id),
      loadSlots(id),
      db.from("hooks").select("id, text, is_selected").eq("video_id", id).order("created_at"),
      db.from("hooks").select("id, text").is("video_id", null).order("created_at"),
      db
        .from("ideas")
        .select("id, title")
        .in("status", ["captured", "developing"])
        .order("created_at", { ascending: false })
        .limit(20),
      db
        .from("components")
        .select("id, source_id, name, layer_id, is_placeholder, sort_order")
        .is("archived_at", null)
        .order("sort_order"),
      db.from("layers").select("id, label, sort_order").order("sort_order"),
      db.from("video_components").select("component_id, state, anchor_beat_id").eq("video_id", id),
    ]);

  if (!video) notFound();

  const beats: WorkspaceBeat[] = running(script.beats).map((b) => ({
    id: b.id,
    text: b.text ?? "",
    story_section: b.story_section,
    t_start_sec: b.t_start_sec,
    function_label: b.function_label,
    function_component_id: b.function_component_id,
  }));

  // Three kinds of loose brick, deliberately kept apart: a line cut from this
  // script, a hook candidate passed over, and a raw idea from the inbox are not
  // interchangeable, even though any of them can become the next line.
  const pile: PileItem[] = [
    ...script.beats
      .filter((b) => b.parked)
      .map((b) => ({ id: b.id, kind: "words" as const, text: b.text || "(empty line)" })),
    ...(hooks ?? [])
      .filter((h) => !h.is_selected)
      .map((h) => ({ id: h.id, kind: "hooks" as const, text: h.text })),
    ...(bank ?? []).map((h) => ({ id: h.id, kind: "bank" as const, text: h.text })),
    ...(ideas ?? []).map((i) => ({ id: i.id, kind: "inbox" as const, text: i.title })),
  ];

  const layerInfo = new Map((layers ?? []).map((l) => [l.id, l]));
  const named = (components ?? []).filter((c) => !c.is_placeholder);

  // The palette lists the framework as it actually is. Nothing is hardcoded, so
  // naming a new technique in /library puts it on the keyboard here.
  const paletteComponents: PaletteComponent[] = named.map((c) => ({
    id: c.id,
    source_id: c.source_id,
    name: c.name,
    layer_id: c.layer_id,
    layer_label: layerInfo.get(c.layer_id ?? "")?.label ?? "Other",
    layer_sort: layerInfo.get(c.layer_id ?? "")?.sort_order ?? 999,
  }));
  paletteComponents.sort((a, b) => a.layer_sort - b.layer_sort);

  // The variables that decide whether the video has what it needs, beside the
  // writing rather than in cards below it. Everything a MAKE decision touches:
  // psychology gates, retention hacks, the format, the story shape, the hook
  // modifiers. Editing vocabulary is deliberately absent — that is EDIT's job,
  // and nobody should be picking b-roll while finishing a sentence.
  const VARIABLE_LAYERS = [
    "checkpoint",
    "hack",
    "format",
    "story_format",
    "story_loop",
    "story",
    "hook_modifier",
    "spoken_hook",
  ];

  const chosenMap = new Map((chosen ?? []).map((c) => [c.component_id, c]));
  const trayComponents: TrayComponent[] = named
    .filter((c) => c.layer_id && VARIABLE_LAYERS.includes(c.layer_id))
    .sort(
      (a, b) =>
        VARIABLE_LAYERS.indexOf(a.layer_id ?? "") - VARIABLE_LAYERS.indexOf(b.layer_id ?? ""),
    )
    .map((c) => {
      const picked = chosenMap.get(c.id);
      return {
        id: c.id,
        source_id: c.source_id,
        name: c.name,
        layer_id: c.layer_id as string,
        layer_label: layerInfo.get(c.layer_id ?? "")?.label ?? "Other",
        state: (picked?.state as "used" | "skipped") ?? "none",
        anchored: Boolean(picked?.anchor_beat_id),
      };
    });

  // The rest of MAKE, under the writing. Two are deliberately left out:
  //   script          — the outliner above IS that slot
  //   hack/checkpoint — those are the leftover-bricks tray, which is the whole
  //                     point of the change; putting them back as cards below
  //                     the script would restore the thing being fixed
  const stackSlots = slots.active.filter(
    (s) =>
      s.workflow_stage === "make" &&
      s.key !== "script" &&
      s.layer_id !== "hack" &&
      s.layer_id !== "checkpoint",
  );

  return (
    <>
      <Workspace
        videoId={id}
        scriptId={script.scriptId}
        initialBeats={beats}
        initialPremise={video.lego_angle ?? ""}
        initialPile={pile}
        paletteComponents={paletteComponents}
        trayComponents={trayComponents}
        targetSec={script.durationTargetSec}
      />

      {stackSlots.length > 0 && (
        <div className="mt-8">
          <p className="mb-2 text-[10px] tracking-wide text-ink-dim">THE REST OF THE IDEA</p>
          <SlotStack
            videoId={id}
            slots={stackSlots}
            slotState={slots.state}
            hideAngleInLegos
          />
        </div>
      )}
    </>
  );
}
