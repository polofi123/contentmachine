import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { aiConfigured } from "@/lib/ai";
import { beatTimeline } from "@/lib/timing";
import { segmentScript } from "@/lib/segment";
import type {
  AnalysisFinding,
  LibraryReference,
  RetrievalTrace,
  StoryBeatNode,
} from "@/lib/analysis";
import { loadScript, running } from "../data";
import { AnalysisUI, type LibraryElementView } from "./analysis-ui";

export const dynamic = "force-dynamic";

/**
 * The analysis workspace.
 *
 * A route of its own rather than a tab in the MAKE rail, because §26 asks for
 * the script to stay visible with its quoted ranges highlighted beside the
 * findings — and a 38% side panel cannot show a script and an argument about
 * the script at the same time.
 */
export default async function AnalysisPage(props: PageProps<"/videos/[id]/analysis">) {
  const { id } = await props.params;

  const [{ data: video }, script] = await Promise.all([
    db.from("videos").select("id, title").eq("id", id).maybeSingle(),
    loadScript(id),
  ]);

  if (!video) notFound();

  // The script as it is NOW — what the reader is looking at, and the thing a
  // past run gets compared against to decide whether it still applies.
  const current = segmentScript(running(script.beats), (rows) => beatTimeline(rows));

  const { data: run } = await db
    .from("analysis_runs")
    .select(
      "id, created_at, model, story_map, summary, trace, library_total, library_citable, script_version_id",
    )
    .eq("video_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let findings: AnalysisFinding[] = [];
  let versionContent: string | null = null;
  let elements: LibraryElementView[] = [];

  if (run) {
    const [{ data: version }, { data: rows }] = await Promise.all([
      db.from("script_versions").select("content").eq("id", run.script_version_id).maybeSingle(),
      db
        .from("analysis_findings")
        .select(
          "id, scope, priority, confidence, diagnosis_type, diagnosis, evidence, why_applicable, intended_effect, operation, state, edited, applied_text, analysis_finding_library_refs(component_id, is_primary, relevance, supporting_text)",
        )
        .eq("run_id", run.id),
    ]);

    versionContent = version?.content ?? null;

    const componentIds = [
      ...new Set(
        (rows ?? []).flatMap((f) =>
          (f.analysis_finding_library_refs ?? []).map((r) => r.component_id),
        ),
      ),
    ];

    // The cited mechanisms as real objects, so a card can open one without a
    // second round trip and without the analysis holding its own copy of the
    // framework's text.
    if (componentIds.length > 0) {
      const [{ data: components }, { data: layers }] = await Promise.all([
        db.from("components").select("id, source_id, name, body, layer_id").in("id", componentIds),
        db.from("layers").select("id, label"),
      ]);

      const labels = new Map((layers ?? []).map((l) => [l.id, l.label]));
      elements = (components ?? []).map((c) => ({
        id: c.id,
        sourceId: c.source_id,
        name: c.name,
        body: c.body ?? "",
        category: c.layer_id ?? "other",
        categoryLabel: labels.get(c.layer_id ?? "") ?? "Other",
      }));
    }

    const byComponent = new Map(elements.map((e) => [e.id, e]));

    findings = (rows ?? []).map((f) => ({
      id: f.id,
      scope: f.scope as AnalysisFinding["scope"],
      priority: f.priority as AnalysisFinding["priority"],
      confidence: Number(f.confidence ?? 0),
      diagnosis: { type: f.diagnosis_type, explanation: f.diagnosis },
      evidence: f.evidence as AnalysisFinding["evidence"],
      libraryReferences: (f.analysis_finding_library_refs ?? [])
        .map((r): LibraryReference | null => {
          const el = byComponent.get(r.component_id);
          if (!el) return null;
          return {
            libraryElementId: r.component_id,
            sourceId: el.sourceId,
            name: el.name,
            category: el.category,
            categoryLabel: el.categoryLabel,
            isPrimary: r.is_primary,
            relevance: Number(r.relevance ?? 0),
            supportingText: r.supporting_text,
          };
        })
        .filter((r): r is LibraryReference => r !== null)
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)),
      reasoning: { whyApplicable: f.why_applicable, intendedEffect: f.intended_effect },
      operation: f.operation as AnalysisFinding["operation"],
      state: f.state as AnalysisFinding["state"],
      edited: f.edited,
      appliedText: f.applied_text,
    }));
  }

  // §20 — a run describes one version. If the words have moved since, every
  // offset in it is potentially pointing at the wrong place, and saying so is
  // more useful than quietly rendering stale highlights.
  const stale = Boolean(run && versionContent !== null && versionContent !== current.content);

  return (
    <AnalysisUI
      videoId={id}
      aiEnabled={aiConfigured()}
      script={current}
      run={
        run
          ? {
              id: run.id,
              createdAt: run.created_at,
              model: run.model,
              storyMap: (run.story_map ?? []) as StoryBeatNode[],
              summary: (run.summary ?? {
                strongestElements: [],
                highestLeverageFindingIds: [],
              }) as { strongestElements: string[]; highestLeverageFindingIds: string[] },
              trace: (run.trace ?? []) as RetrievalTrace[],
              coverage: {
                libraryTotal: run.library_total ?? 0,
                libraryCitable: run.library_citable ?? 0,
              },
              versionContent,
            }
          : null
      }
      findings={findings}
      elements={elements}
      stale={stale}
    />
  );
}
