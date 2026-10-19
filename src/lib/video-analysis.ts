// Video analysis: the normalized shape, and the parser that fills it from pasted
// text. Pure functions, no I/O — the import form previews with them in the
// browser and the server action re-runs the same sanitiser before saving.
//
// Nothing here invents anything. A field the input did not contain stays null /
// empty, and text that could not be placed is kept in `unparsed` instead of
// being dropped.

export type AnalysisSource = "sandcastles_export" | "json" | "plain_text" | "manual";

export type Section = {
  name: string;
  description: string | null;
  sentences: string[];
  start: number | null;
  end: number | null;
};

export type TranscriptSegment = { start: number | null; end: number | null; text: string };

export type VideoAnalysis = {
  summary: string | null;
  caption: string | null;
  topic: string | null;
  seed: string | null;
  angle: string | null;
  commonBelief: string | null;
  contrarianReality: string | null;
  supportingEvidence: string[];
  hook: {
    spoken: string | null;
    category: string | null;
    template: string | null;
    why: string | null;
  };
  format: {
    category: string | null;
    type: string | null;
    flavor: string | null;
    reasoning: string | null;
    structureSummary: string | null;
    sections: Section[];
  };
  visual: {
    category: string | null;
    type: string | null;
    hook: string | null;
    elements: string[];
    editing: string[];
  };
  transcript: {
    text: string | null;
    segments: TranscriptSegment[];
    /** "pasted": given as a transcript. "sections": assembled from narrative sections. */
    origin: "pasted" | "sections" | null;
  };
  /** Numbers that arrived with the import. Never computed or guessed. */
  stats: Partial<Record<"views" | "likes" | "comments" | "engagementRate" | "outlierScore", number>>;
  /** Input that matched nothing. Shown for correction, never discarded. */
  unparsed: string;
};

export type ParseResult = {
  source: AnalysisSource;
  analysis: VideoAnalysis;
  warnings: string[];
};

export const emptyAnalysis = (): VideoAnalysis => ({
  summary: null, caption: null, topic: null, seed: null, angle: null,
  commonBelief: null, contrarianReality: null, supportingEvidence: [],
  hook: { spoken: null, category: null, template: null, why: null },
  format: { category: null, type: null, flavor: null, reasoning: null, structureSummary: null, sections: [] },
  visual: { category: null, type: null, hook: null, elements: [], editing: [] },
  transcript: { text: null, segments: [], origin: null },
  stats: {},
  unparsed: "",
});

/** True when the analysis carries any observation of the picture itself. */
export const hasVisualEvidence = (a: VideoAnalysis) =>
  Boolean(a.visual.category || a.visual.type || a.visual.hook || a.visual.elements.length || a.visual.editing.length);

/** "heros_journey" → "Heros journey". Display only; stored values stay as imported. */
export function humanize(value: string | null): string | null {
  if (!value) return null;
  const s = value.replace(/[_-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : null;
}

export function formatTime(sec: number | null): string {
  if (sec == null) return "";
  const total = Math.round(sec);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- helpers

const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");
const str = (v: unknown): string | null => {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
};
const num = (v: unknown): number | null => {
  if (typeof v === "string" && !v.trim()) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const strList = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(str).filter((s): s is string => s !== null);
  const s = str(v);
  return s ? s.split(/\r?\n/).map(cleanBullet).filter(Boolean) : [];
};
const cleanBullet = (s: string) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim();

/** Strips a ```json fence if the whole paste is wrapped in one. */
function unfence(text: string): string {
  const m = text.trim().match(/^```[a-z]*\s*\n([\s\S]*?)\n```$/i);
  return m ? m[1] : text.trim();
}

// ---------------------------------------------------------------- JSON

type Flat = Map<string, unknown>;

/** Indexes object keys (normalised) to depth 3, shallowest wins. */
function flatten(obj: unknown, into: Flat = new Map(), depth = 0): Flat {
  if (!obj || typeof obj !== "object" || Array.isArray(obj) || depth > 3) return into;
  const entries = Object.entries(obj as Record<string, unknown>);
  for (const [k, v] of entries) if (!into.has(norm(k))) into.set(norm(k), v);
  for (const [, v] of entries) flatten(v, into, depth + 1);
  return into;
}

const first = (flat: Flat, ...names: string[]): unknown => {
  for (const n of names) {
    const v = flat.get(norm(n));
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
};

function parseSections(raw: unknown): Section[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item, i): Section[] => {
    if (!item || typeof item !== "object") return [];
    const f = flatten(item);
    const name = str(first(f, "section_name", "name", "title", "label")) ?? `Section ${i + 1}`;
    const sentences = strList(first(f, "transcript_sentences", "sentences", "transcript", "text", "lines"));
    return [{
      name,
      description: str(first(f, "section_description", "description", "purpose", "explanation")),
      sentences,
      start: num(first(f, "start_second", "start", "start_time", "from")),
      end: num(first(f, "end_second", "end", "end_time", "to")),
    }];
  });
}

function fromObject(obj: Record<string, unknown>): { analysis: VideoAnalysis; warnings: string[] } {
  const f = flatten(obj);
  // Generic names (summary, views, comments…) are only trusted at the top
  // level, so a nested channel/author object cannot supply them.
  const top: Flat = new Map(Object.entries(obj).map(([k, v]) => [norm(k), v]));
  const a = emptyAnalysis();
  const warnings: string[] = [];

  a.summary = str(first(top, "summary", "video_summary"));
  a.caption = str(first(top, "caption", "description_text"));
  a.topic = str(first(f, "topic"));
  a.seed = str(first(f, "seed", "idea_seed"));
  a.angle = str(first(f, "angle", "unique_angle"));
  a.commonBelief = str(first(f, "common_belief", "common_belief_challenged"));
  a.contrarianReality = str(first(f, "contrarian_reality"));
  a.supportingEvidence = strList(first(f, "supporting_evidence") ?? first(top, "evidence"));

  const hook = first(f, "hook");
  a.hook.spoken = str(first(f, "spoken_hook", "hook_text", "actual_hook")) ?? str(hook);
  a.hook.category = str(first(f, "spoken_hook_category", "hook_category"));
  a.hook.template = str(first(f, "spoken_hook_madlib", "hook_template", "hook_formula", "madlib"));
  a.hook.why = str(first(f, "hook_alignment", "hook_reasoning", "why_it_works", "hook_explanation"));

  a.format.category = str(first(f, "format_category", "storytelling_category"));
  a.format.type = str(first(f, "format_type", "storytelling_type"));
  a.format.flavor = str(first(f, "format_flavor", "format_variation", "flavor"));
  a.format.reasoning = str(first(f, "format_reasoning", "format_explanation"));
  a.format.structureSummary = str(first(f, "structure_summary"));
  a.format.sections = parseSections(first(f, "structure_sections", "narrative_sections", "sections"));

  a.visual.category = str(first(f, "visual_layout_category", "layout_category"));
  a.visual.type = str(first(f, "visual_layout_type", "layout_type"));
  a.visual.hook = str(first(f, "visual_hook"));
  a.visual.elements = strList(first(f, "visual_elements", "composition"));
  a.visual.editing = strList(first(f, "editing_techniques") ?? first(top, "editing"));

  const t = first(f, "transcript", "full_transcript");
  if (Array.isArray(t)) {
    a.transcript.segments = t.flatMap((x): TranscriptSegment[] => {
      if (typeof x === "string") return x.trim() ? [{ start: null, end: null, text: x.trim() }] : [];
      const tf = flatten(x);
      const text = str(first(tf, "text", "sentence", "content"));
      return text ? [{ start: num(first(tf, "start", "start_second", "start_time")), end: num(first(tf, "end", "end_second", "end_time")), text }] : [];
    });
    if (a.transcript.segments.length) {
      a.transcript.text = a.transcript.segments.map((s) => s.text).join(" ");
      a.transcript.origin = "pasted";
    }
  } else if (str(t)) {
    a.transcript.text = str(t);
    a.transcript.origin = "pasted";
  }

  const stat = (...n: string[]) => num(first(top, ...n)) ?? undefined;
  const stats = {
    views: stat("view_count", "views"),
    likes: stat("like_count", "likes"),
    comments: stat("comment_count", "comments"),
    engagementRate: stat("engagement_rate"),
    outlierScore: stat("outlier_score"),
  };
  for (const [k, v] of Object.entries(stats)) if (v !== undefined) a.stats[k as keyof VideoAnalysis["stats"]] = v;

  if (!a.format.sections.length && first(f, "structure_sections", "narrative_sections") !== undefined) {
    warnings.push("Narrative sections were present but could not be read.");
  }
  return { analysis: finalize(a), warnings };
}

// ---------------------------------------------------------------- plain text

// Heading label → where the text goes. Labels are matched after normalisation.
const LABELS: Record<string, string> = {
  summary: "summary", videosummary: "summary", overview: "summary",
  caption: "caption",
  transcript: "transcript", fulltranscript: "transcript",
  topic: "topic",
  ideaseed: "seed", seed: "seed",
  uniqueangle: "angle", angle: "angle",
  commonbelief: "commonBelief", commonbeliefbeingchallenged: "commonBelief", commonbeliefchallenged: "commonBelief",
  contrarianreality: "contrarianReality",
  supportingevidence: "supportingEvidence", evidence: "supportingEvidence",
  hook: "hookSpoken", spokenhook: "hookSpoken", actualhook: "hookSpoken", actualspokenhook: "hookSpoken",
  hookcategory: "hookCategory",
  hookformula: "hookTemplate", hooktemplate: "hookTemplate", hookformulatemplate: "hookTemplate", madlib: "hookTemplate",
  whythishookworks: "hookWhy", whyitworks: "hookWhy", hookalignment: "hookWhy", hookexplanation: "hookWhy",
  storytellingcategory: "formatCategory", formatcategory: "formatCategory", storycategory: "formatCategory",
  storytellingformat: "formatType", format: "formatType", formattype: "formatType", storytype: "formatType", storytellingtype: "formatType",
  formatvariation: "formatFlavor", formatflavor: "formatFlavor", flavor: "formatFlavor", variation: "formatFlavor",
  structure: "structureSummary", structuresummary: "structureSummary", structureexplanation: "formatReasoning",
  formatreasoning: "formatReasoning", whythisformatworks: "formatReasoning",
  storystructure: "sections", narrativesections: "sections", narrativestructure: "sections", sections: "sections",
  visuallayoutcategory: "visualCategory", visualcategory: "visualCategory",
  visuallayout: "visualType", visuallayouttype: "visualType", layouttype: "visualType", layout: "visualType",
  visualhook: "visualHook",
  visualelements: "visualElements", composition: "visualElements",
  editingtechniques: "editing", editing: "editing",
};

// A heading is a known label followed by a colon (value inline) or by nothing.
// Markdown emphasis and leading #'s are stripped first, so "## Hook",
// "**Hook:** text" and "Hook: text" all read the same.
// Real lines are short. Longer ones are truncated and never regex-scanned.
const MAX_LINE = 2000;
const HEADING = /^([A-Za-z][A-Za-z '&/-]{1,45}?)\s*(?::\s*(.*)|$)/;
const stripMarkup = (line: string) => line.replace(/^\s*#{1,6}\s*/, "").replace(/\*\*|__/g, "").trim();

// Two flavours with the same three capture groups. A range ("0-3", "0:00-0:03")
// may use bare seconds because the separator proves it is a range; the lone
// leading token of a transcript line may not, or "10 things I wish…" would lose
// its "10" to a timestamp.
const TIME = String.raw`(?:(\d+):(\d{2})|(\d+(?:\.\d+)?)\s*s?)`;
const TIME_STRICT = String.raw`(?:(\d+):(\d{2})|(\d+(?:\.\d+)?)\s*s\b)`;
const RANGE = new RegExp(String.raw`^\s*[\[(]?\s*${TIME}\s*(?:-|–|—|to)\s*${TIME}\s*[\])]?\s*[:\-–—]?\s*(.*)$`, "i");

function toSec(m: RegExpMatchArray, i: number): number {
  return m[i] !== undefined ? Number(m[i]) * 60 + Number(m[i + 1]) : Number(m[i + 2]);
}

// Strips one matching pair of surrounding quotes; a lone apostrophe ("the kids’") stays.
const unquote = (raw: string) => {
  const s = raw.replace(/^\s*[-*•]\s+/, "").trim();
  const pairs: Record<string, string> = { '"': '"', "“": "”", "'": "'", "‘": "’" };
  return s.length > 1 && pairs[s[0]] === s[s.length - 1] ? s.slice(1, -1).trim() : s;
};

function parseSectionLines(lines: string[]): Section[] {
  const out: Section[] = [];
  for (const line of lines) {
    const m = line.length > MAX_LINE ? null : line.match(RANGE);
    if (m) {
      const [name, ...desc] = m[7].split(/\s+[—–-]\s+|:\s+/);
      out.push({
        name: cleanBullet(name).replace(/\*+/g, "").trim() || `Section ${out.length + 1}`,
        description: desc.join(" - ").trim() || null,
        sentences: [], start: toSec(m, 1), end: toSec(m, 4),
      });
    } else if (out.length && line.trim()) {
      const cur = out[out.length - 1];
      if (/^\s*(?:[-*•]\s*)?["“]|^\s*transcript\s*:/i.test(line)) {
        cur.sentences.push(unquote(line.replace(/^\s*transcript\s*:\s*/i, "")));
      } else {
        cur.description = [cur.description, cleanBullet(line)].filter(Boolean).join(" ");
      }
    }
  }
  return out;
}

function parseTranscriptLines(lines: string[]): TranscriptSegment[] {
  const stamp = new RegExp(String.raw`^\s*[\[(]?\s*${TIME_STRICT}(?:\s*(?:-|–|—|to)\s*${TIME})?\s*[\])]?\s*[:\-–—]?\s*(.+)$`, "i");
  return lines.flatMap((line): TranscriptSegment[] => {
    const m = line.length > MAX_LINE ? null : line.match(stamp);
    if (m) return [{ start: toSec(m, 1), end: m[4] !== undefined || m[6] !== undefined ? toSec(m, 4) : null, text: m[7].trim() }];
    return line.trim() ? [{ start: null, end: null, text: line.trim() }] : [];
  });
}

function fromText(text: string): { analysis: VideoAnalysis; warnings: string[] } {
  const a = emptyAnalysis();
  const warnings: string[] = [];
  const buckets = new Map<string, string[]>();
  const unparsed: string[] = [];
  let current: string | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.length > MAX_LINE ? rawLine.slice(0, MAX_LINE) : rawLine;
    const h = rawLine.length > MAX_LINE ? null : stripMarkup(line).match(HEADING);
    const key = h ? LABELS[norm(h[1])] : undefined;
    // Inside a transcript, "Hook: here's the thing…" is speech, not a heading,
    // unless it carries markdown markers.
    const leaves = current !== "transcript" || line !== stripMarkup(line) || key === "transcript";
    if (h && key && leaves) {
      current = key;
      if (!buckets.has(current)) buckets.set(current, []);
      if (h[2]?.trim()) buckets.get(current)!.push(h[2].trim());
    } else if (current) {
      buckets.get(current)!.push(line);
    } else if (line.trim()) {
      unparsed.push(line);
    }
  }

  const para = (k: string) => {
    const v = buckets.get(k)?.join("\n").trim();
    return v ? v : null;
  };
  const list = (k: string) => (buckets.get(k) ?? []).map(cleanBullet).filter(Boolean);

  a.summary = para("summary"); a.caption = para("caption");
  a.topic = para("topic"); a.seed = para("seed"); a.angle = para("angle");
  a.commonBelief = para("commonBelief"); a.contrarianReality = para("contrarianReality");
  a.supportingEvidence = list("supportingEvidence");
  a.hook = { spoken: para("hookSpoken") && unquote(para("hookSpoken")!), category: para("hookCategory"), template: para("hookTemplate"), why: para("hookWhy") };
  a.format = {
    category: para("formatCategory"), type: para("formatType"), flavor: para("formatFlavor"),
    reasoning: para("formatReasoning"), structureSummary: para("structureSummary"),
    sections: parseSectionLines(buckets.get("sections") ?? []),
  };
  a.visual = { category: para("visualCategory"), type: para("visualType"), hook: para("visualHook"), elements: list("visualElements"), editing: list("editing") };

  const tLines = buckets.get("transcript") ?? [];
  if (tLines.some((l) => l.trim())) {
    a.transcript.segments = parseTranscriptLines(tLines);
    a.transcript.text = a.transcript.segments.map((s) => s.text).join(" ");
    a.transcript.origin = "pasted";
  }

  if (buckets.get("sections")?.some((l) => l.trim()) && !a.format.sections.length) {
    warnings.push("A narrative-sections block was found but no timestamped sections (e.g. 0:00-0:03 Name — description) could be read.");
    unparsed.push(...(buckets.get("sections") ?? []));
  }
  a.unparsed = unparsed.join("\n").trim();
  return { analysis: finalize(a), warnings };
}

// ---------------------------------------------------------------- entry points

/**
 * If no transcript was supplied but narrative sections carry spoken sentences,
 * the transcript is assembled from them, in section order. Marked as such so the
 * UI can say where it came from.
 */
function finalize(a: VideoAnalysis): VideoAnalysis {
  if (!a.transcript.text) {
    const segs = a.format.sections.flatMap((s) =>
      s.sentences.map((text) => ({ start: s.start, end: s.end, text })),
    );
    if (segs.length) {
      a.transcript = { text: segs.map((s) => s.text).join(" "), segments: segs, origin: "sections" };
    }
  }
  return a;
}

export function parseAnalysis(input: string): ParseResult {
  const text = unfence(input);
  if (!text) return { source: "plain_text", analysis: emptyAnalysis(), warnings: ["Nothing to import."] };

  if (/^[[{]/.test(text)) {
    try {
      let data: unknown = JSON.parse(text);
      const extra: string[] = [];
      if (Array.isArray(data)) {
        if (data.length > 1) extra.push(`${data.length} items found; only the first was imported.`);
        data = data[0];
      }
      if (data && typeof data === "object") {
        const r = fromObject(data as Record<string, unknown>);
        r.warnings.push(...extra);
        // The Sandcastles library response is recognisable by its own field names.
        const sandcastles = "spoken_hook_madlib" in (data as object) || "format_category" in (data as object);
        return { source: sandcastles ? "sandcastles_export" : "json", ...r };
      }
    } catch {
      // Not valid JSON after all — fall through and treat it as text.
    }
  }

  const r = fromText(text);
  const looksLikeExport = /export for llm/i.test(text);
  return { source: looksLikeExport ? "sandcastles_export" : "plain_text", ...r };
}

/**
 * Coerces an untrusted object (the preview form posts one back) into the exact
 * VideoAnalysis shape. Anything not in the shape is dropped; strings are capped.
 */
export function sanitizeAnalysis(raw: unknown): VideoAnalysis {
  const base = emptyAnalysis();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const s = (v: unknown, max = 8000) => str(v)?.slice(0, max) ?? null;
  const l = (v: unknown) => strList(v).slice(0, 100).map((x) => x.slice(0, 2000));
  const secs = (Array.isArray(o.format?.sections) ? o.format.sections : []).slice(0, 100).map((x: any, i: number): Section => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
    name: s(x?.name, 200) ?? `Section ${i + 1}`,
    description: s(x?.description, 2000),
    sentences: l(x?.sentences),
    start: num(x?.start), end: num(x?.end),
  }));
  const segs = (Array.isArray(o.transcript?.segments) ? o.transcript.segments : []).slice(0, 2000).flatMap((x: any): TranscriptSegment[] => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const text = s(x?.text, 2000);
    return text ? [{ start: num(x?.start), end: num(x?.end), text }] : [];
  });
  const stats: VideoAnalysis["stats"] = {};
  for (const k of ["views", "likes", "comments", "engagementRate", "outlierScore"] as const) {
    const n = num(o.stats?.[k]);
    if (n !== null) stats[k] = n;
  }
  const tText = s(o.transcript?.text, 100000) ?? (segs.length ? segs.map((x: TranscriptSegment) => x.text).join(" ") : null);
  return {
    ...base,
    summary: s(o.summary), caption: s(o.caption), topic: s(o.topic, 500), seed: s(o.seed),
    angle: s(o.angle), commonBelief: s(o.commonBelief), contrarianReality: s(o.contrarianReality),
    supportingEvidence: l(o.supportingEvidence),
    hook: { spoken: s(o.hook?.spoken), category: s(o.hook?.category, 200), template: s(o.hook?.template), why: s(o.hook?.why) },
    format: {
      category: s(o.format?.category, 200), type: s(o.format?.type, 200), flavor: s(o.format?.flavor),
      reasoning: s(o.format?.reasoning), structureSummary: s(o.format?.structureSummary), sections: secs,
    },
    visual: {
      category: s(o.visual?.category, 200), type: s(o.visual?.type, 200), hook: s(o.visual?.hook),
      elements: l(o.visual?.elements), editing: l(o.visual?.editing),
    },
    transcript: {
      text: tText,
      segments: segs,
      origin: tText ? (o.transcript?.origin === "sections" ? "sections" : "pasted") : null,
    },
    stats,
    unparsed: s(o.unparsed, 100000) ?? "",
  };
}

// ---------------------------------------------------------------- Idea Legos

export type LegoPatch = Partial<Record<
  "lego_topic" | "lego_angle" | "lego_hook" | "lego_story_structure" | "lego_visual_format",
  string
>>;

/**
 * Prose for the existing Idea Lego fields. The Legos are free text, so imported
 * labels go in as readable words; no taxonomy match is attempted or implied.
 * Key visuals and audio are deliberately never filled — nothing imported
 * observes them.
 */
export function legoPatch(a: VideoAnalysis): LegoPatch {
  const join = (...p: (string | null)[]) => p.filter(Boolean).join(" — ");
  const patch: LegoPatch = {};
  if (a.topic) patch.lego_topic = a.topic;
  if (a.angle) patch.lego_angle = a.angle;
  if (a.hook.spoken) patch.lego_hook = a.hook.spoken;
  const structure = join(humanize(a.format.type) ?? humanize(a.format.category), a.format.flavor);
  if (structure) patch.lego_story_structure = structure;
  const visual = join(humanize(a.visual.type) ?? humanize(a.visual.category), a.visual.hook);
  if (visual) patch.lego_visual_format = visual;
  return patch;
}
