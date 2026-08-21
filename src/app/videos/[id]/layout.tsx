import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Completeness, type WorkflowStage } from "./completeness";
import { ModeSwitch } from "./mode-switch";
import { loadSlots } from "./data";

export const dynamic = "force-dynamic";

// One header over both workspaces, because they are two views of ONE video.
// Title, completeness and runtime do not belong to MAKE or to EDIT — they
// describe the thing both of them are editing.
export default async function VideoLayout(props: LayoutProps<"/videos/[id]">) {
  const { id } = await props.params;

  // Runtime and word count deliberately do NOT live up here. Text saves skip
  // revalidation so the caret is never yanked mid-sentence, which would leave a
  // header estimate quietly lagging the words on screen. The live one is in the
  // outliner's footer, where it can be honest.
  const [{ data: video }, slots] = await Promise.all([
    db.from("videos").select("*").eq("id", id).maybeSingle(),
    loadSlots(id),
  ]);

  if (!video) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6">
        <Link href="/videos" className="text-xs text-ink-faint hover:text-ink">
          ← videos
        </Link>

        <div className="mt-2 flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-medium tracking-tight text-ink">{video.title}</h1>
            <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-faint">
              <span>{video.is_mine ? (video.status ?? "idea") : "outlier"}</span>
              {video.channel_name && <span>{video.channel_name}</span>}
              {video.loop_type && <span className="text-accent/70">{video.loop_type} loop</span>}
            </p>
          </div>

          {video.is_mine && <ModeSwitch videoId={id} />}

          {video.is_mine && (
            <Completeness
              videoId={id}
              slots={slots.active.map((s) => ({
                key: s.key,
                label: s.label,
                state: (slots.state.get(s.key) ?? "empty") as "empty" | "filled" | "skipped",
                stage: s.workflow_stage as WorkflowStage,
              }))}
              available={slots.available.map((s) => ({
                key: s.key,
                label: s.label,
                description: s.description,
                stage: s.workflow_stage as WorkflowStage,
              }))}
            />
          )}
        </div>
      </div>

      {props.children}
    </div>
  );
}
