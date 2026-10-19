// The framework, as something you can search.
//
// The library is `components` and stays `components` — this file does not copy
// it, reshape it into an analysis-only taxonomy, or hold a second version of
// the truth. It exposes the same rows as retrievable elements and builds an
// index over them, so /library and the analysis engine cannot disagree about
// what the framework says.
//
// Retrieval is BM25 over weighted fields. That is a deliberate, stated choice
// rather than a placeholder calling itself semantic search: there is no
// embedding provider wired into this app, Anthropic does not serve embeddings,
// and adding a second vendor for 271 short documents would be a worse trade
// than a good lexical index. The honest description is "field-weighted BM25
// with query expansion", and where that is weaker than embeddings — a section
// about a "twist" not matching a mechanism that only ever says "head fake" —
// the expansion table below is what closes the gap.
//
// If embeddings are ever added, `retrieve()` is the only function that has to
// change; everything downstream consumes ranked candidates and does not care
// how they were ranked.

export type LibraryElement = {
  /** Stable across renames — this is what findings cite. */
  id: string;
  /** 'HOOK-02'. Null for components the creator added themselves. */
  sourceId: string | null;
  name: string;
  /** The layer id — the library's own taxonomy, not a second one. */
  category: string;
  categoryLabel: string;
  /** First meaningful line of the body, for cards and pickers. */
  description: string;
  /** The full body. A citation must be a substring of this. */
  sourceText: string;
  /** Derived tokens, used for retrieval only. Never presented as authored. */
  tags: string[];
  /** Story roles and analysis areas this mechanism bears on. */
  applicableTo: string[];
  parentId: string | null;
  /**
   * Whether this element carries enough text to support a verifiable excerpt.
   *
   * 137 of the library's 271 elements are name-only — "Camera Whip", "Talking
   * head" — which are real framework entries but cannot ground a citation. They
   * stay retrievable and nameable; they are just not allowed to be a finding's
   * primary mechanism, because a citation with nothing to quote is exactly the
   * fabricated evidence this engine exists to avoid.
   */
  citable: boolean;
};

/** Below this, a body is a label rather than an explanation. */
const CITABLE_MIN_CHARS = 80;

export type ComponentRow = {
  id: string;
  source_id: string | null;
  name: string;
  body: string | null;
  layer_id: string | null;
  parent_id: string | null;
};

/**
 * Which storytelling functions each layer speaks to.
 *
 * Derived from the layer, not hand-written per component, so a new component in
 * an existing layer is immediately retrievable for the right kind of section
 * with no extra bookkeeping. Layers the analysis never reasons about are absent
 * rather than mapped to everything.
 */
const LAYER_APPLIES: Record<string, string[]> = {
  hook: ["hook", "value", "direction"],
  hook_word: ["hook"],
  spoken_hook: ["hook"],
  hook_modifier: ["hook", "tension"],
  visual_hook: ["hook", "visual"],
  tension: ["tension", "question", "conflict", "twist"],
  lens: ["lens", "direction"],
  story: ["dance", "specificity", "rhythm", "meaning", "tension", "lens"],
  story_format: ["direction", "loops"],
  story_loop: ["loops", "tension", "rehook"],
  script: ["value", "loops", "rhythm"],
  hack: ["tension", "loops", "rehook"],
  checkpoint: ["tension", "value"],
  trust: ["value", "meaning"],
  engagement: ["meaning", "cta"],
  visual_layout: ["visual"],
  edit: ["visual"],
  thumbnail: ["packaging"],
  packaging: ["packaging"],
};

/**
 * Vocabulary the framework and a working writer do not share.
 *
 * A detected concern says "the reveal lands too late"; the mechanism that
 * addresses it is filed under "Head Fake" and never uses the word reveal. Pure
 * term matching misses that, so queries are expanded along these lines before
 * scoring. Deliberately small and one-directional — this is a bridge over known
 * vocabulary gaps, not a thesaurus, and every entry here is a pair the library
 * actually uses.
 */
const EXPANSION: Record<string, string[]> = {
  twist: ["head", "fake", "unexpected", "reveal", "surprise"],
  reveal: ["payoff", "answer", "head", "fake"],
  reveals: ["payoff", "answer"],
  question: ["loop", "open", "uncertainty", "intrigue", "curiosity"],
  questions: ["loop", "open", "uncertainty"],
  tension: ["uncertainty", "intrigue", "stakes", "conflict"],
  boring: ["retention", "attention", "value", "rhythm"],
  slow: ["speed", "value", "pace", "retention"],
  flat: ["rhythm", "dance", "monotone", "variation"],
  repetitive: ["rhythm", "variation", "pattern"],
  confusing: ["clarity", "simplification", "uncertainty"],
  ending: ["payoff", "meaning", "resolution", "cta"],
  start: ["hook", "opening", "first"],
  opening: ["hook", "first", "scroll"],
  setup: ["foreshadow", "promise", "open", "loop"],
  payoff: ["resolution", "answer", "reward", "meaning"],
  cause: ["dance", "therefore", "consequence", "causality"],
  causality: ["dance", "therefore", "but"],
  order: ["structure", "sequence", "position", "serial"],
  vague: ["specific", "sensory", "concrete", "show"],
  abstract: ["specific", "sensory", "concrete", "show"],
  stakes: ["risk", "lose", "consequence", "urgency"],
  pacing: ["rhythm", "speed", "value", "loop"],
  angle: ["lens", "perspective", "take"],
  meaning: ["why", "point", "matters", "teaching"],
};

const STOPWORDS = new Set(
  ("the a an and or but of to in on at is are was were be been it its this that these those " +
    "for with as by from into your you i we they he she his her not no do does did done " +
    "have has had can could would should will just too very more most much many any some " +
    "what which who when where why how than then there here about over under out up down " +
    "line lines script viewer video")
    .split(/\s+/)
    .filter(Boolean),
);

/** Lowercase, split, drop stopwords, crude suffix strip. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t))
    .map((t) => t.replace(/(ings|ing|ies|ed|es|s)$/, (m) => (t.length - m.length >= 3 ? "" : m)));
}

export function toElement(row: ComponentRow, categoryLabel: string): LibraryElement {
  const body = row.body ?? "";
  const description =
    body
      .split("\n")
      .map((l) => l.replace(/[*_>#`]/g, "").trim())
      .find((l) => l.length > 0) ?? "";

  const category = row.layer_id ?? "other";

  return {
    id: row.id,
    sourceId: row.source_id,
    name: row.name,
    category,
    categoryLabel,
    description: description.slice(0, 240),
    sourceText: body,
    tags: [...new Set([...tokenize(row.name), ...tokenize(category)])],
    applicableTo: LAYER_APPLIES[category] ?? [],
    parentId: row.parent_id,
    citable: body.trim().length >= CITABLE_MIN_CHARS,
  };
}

/* ------------------------------------------------------------------ index */

type Posting = { docIndex: number; tf: number };

export type LibraryIndex = {
  elements: LibraryElement[];
  postings: Map<string, Posting[]>;
  lengths: number[];
  avgLength: number;
};

/**
 * Field weights.
 *
 * A mechanism's name and its source id are what a query is most likely to be
 * *about*; the body is long and mentions everything, so an unweighted index
 * ranks whichever entry rambles most. These multipliers are term-frequency
 * multipliers, applied at index time.
 */
const FIELD_WEIGHTS = { name: 4, sourceId: 4, category: 2, body: 1 } as const;

export function buildIndex(elements: LibraryElement[]): LibraryIndex {
  const postings = new Map<string, Posting[]>();
  const lengths: number[] = [];

  elements.forEach((el, docIndex) => {
    const counts = new Map<string, number>();
    const add = (text: string, weight: number) => {
      for (const term of tokenize(text)) {
        counts.set(term, (counts.get(term) ?? 0) + weight);
      }
    };

    add(el.name, FIELD_WEIGHTS.name);
    if (el.sourceId) add(el.sourceId, FIELD_WEIGHTS.sourceId);
    add(`${el.category} ${el.categoryLabel}`, FIELD_WEIGHTS.category);
    add(el.sourceText, FIELD_WEIGHTS.body);

    let length = 0;
    for (const [term, tf] of counts) {
      postings.set(term, [...(postings.get(term) ?? []), { docIndex, tf }]);
      length += tf;
    }
    lengths.push(length);
  });

  const avgLength = lengths.reduce((a, b) => a + b, 0) / Math.max(lengths.length, 1);
  return { elements, postings, lengths, avgLength };
}

export type Candidate = {
  element: LibraryElement;
  /** Normalised 0–1 within this query's results. Stored on the finding. */
  relevance: number;
  /** Which query terms actually hit, for the developer trace. */
  matched: string[];
};

const K1 = 1.4;
const B = 0.72;

/**
 * Rank library elements against a query built from the script section.
 *
 * `applicableTo` is a soft boost, never a filter — a mechanism filed under one
 * layer can still be the right answer for a section the analysis labelled
 * something else, and hard filtering would make the index unable to surprise
 * you, which is most of what a library is for.
 */
export function retrieve(
  index: LibraryIndex,
  query: string,
  options: { limit?: number; area?: string | null; citableOnly?: boolean } = {},
): Candidate[] {
  const { limit = 6, area = null, citableOnly = false } = options;

  const base = tokenize(query);
  const expanded = new Set(base);
  for (const term of base) for (const extra of EXPANSION[term] ?? []) expanded.add(extra);

  const terms = [...expanded];
  if (terms.length === 0) return [];

  const N = index.elements.length;
  const scores = new Map<number, number>();
  const hits = new Map<number, Set<string>>();

  for (const term of terms) {
    const posting = index.postings.get(term);
    if (!posting) continue;

    const idf = Math.log(1 + (N - posting.length + 0.5) / (posting.length + 0.5));
    // Expanded terms count for less than what the query actually said.
    const weight = base.includes(term) ? 1 : 0.45;

    for (const { docIndex, tf } of posting) {
      const norm = 1 - B + (B * index.lengths[docIndex]) / index.avgLength;
      const score = idf * ((tf * (K1 + 1)) / (tf + K1 * norm)) * weight;
      scores.set(docIndex, (scores.get(docIndex) ?? 0) + score);
      hits.set(docIndex, (hits.get(docIndex) ?? new Set()).add(term));
    }
  }

  const ranked = [...scores.entries()]
    .map(([docIndex, score]) => {
      const element = index.elements[docIndex];

      // The area signal, in both directions.
      //
      // A lift for mechanisms that declare they speak to this kind of section,
      // and a damper on ones that declare a different remit entirely. Without
      // the damper a lexical collision wins outright — "the opening line is an
      // ORDER" pulled up "Ordered List", a visual-layout entry, purely on the
      // word. Still soft, never a filter: an element that declares nothing is
      // untouched, and a strong enough text match can still surface something
      // filed elsewhere, which is most of what a library is for.
      const declares = element.applicableTo.length > 0;
      const boost = !area || !declares ? 1 : element.applicableTo.includes(area) ? 1.6 : 0.55;

      return { element, raw: score * boost, matched: [...(hits.get(docIndex) ?? [])] };
    })
    .filter((r) => (citableOnly ? r.element.citable : true))
    // Equal scores are ordered by id, so the candidates never depend on the order rows came back from the database.
    .sort((a, b) => b.raw - a.raw || (a.element.id < b.element.id ? -1 : a.element.id > b.element.id ? 1 : 0))
    .slice(0, limit);

  const top = ranked[0]?.raw ?? 1;

  return ranked.map((r) => ({
    element: r.element,
    relevance: Number((r.raw / top).toFixed(3)),
    matched: r.matched.sort(),
  }));
}

/**
 * The smallest passage of an element that justifies citing it.
 *
 * Used to propose a supporting excerpt to the model and to check the one it
 * returns is real. Splits the body into paragraphs and picks the one sharing
 * most terms with the query — the point of §15 is a short verifiable quote, and
 * handing back the whole component would make verification impossible.
 */
export function bestExcerpt(element: LibraryElement, query: string, maxChars = 320): string {
  const terms = new Set(tokenize(query));
  const paragraphs = element.sourceText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 24);

  if (paragraphs.length === 0) return element.sourceText.trim().slice(0, maxChars);

  const scored = paragraphs.map((p) => ({
    p,
    hits: tokenize(p).filter((t) => terms.has(t)).length,
  }));

  scored.sort((a, b) => b.hits - a.hits);
  return scored[0].p.slice(0, maxChars);
}

/**
 * Is this excerpt genuinely from this element?
 *
 * Whitespace-insensitive substring check. Markdown bodies wrap unpredictably
 * and a model re-flowing a quote it copied correctly should not be treated as
 * fabricating one — but anything that is not present in the source text after
 * that normalisation is a fabricated citation and fails.
 */
export function excerptIsGrounded(element: LibraryElement, excerpt: string): boolean {
  const flat = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const needle = flat(excerpt);
  if (needle.length < 20) return false;
  return flat(element.sourceText).includes(needle);
}
