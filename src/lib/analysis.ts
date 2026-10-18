// The shapes the analysis engine produces.
//
// Kept in one plain module so the server pipeline, the server actions and the
// client UI all speak about a finding in the same words. Nothing here executes;
// it is the contract.

export const OPERATION_TYPES = [
  "keep",
  "cut",
  "move",
  "merge",
  "split",
  "replace",
  "rewrite",
  "reorder",
  "add_beat",
  "add_visual",
  "add_hook",
  "add_rehook",
  "change_lens",
  "callback",
] as const;

export type OperationType = (typeof OPERATION_TYPES)[number];

/**
 * What should actually change.
 *
 * Deliberately not collapsible to replacement text. The operations that matter
 * most on a short script — cut this, move the reveal earlier, merge these two,
 * split this into three — are structural, and an engine that can only offer
 * rewrites will propose a rewrite for a problem that is really an ordering
 * problem. `keep` is a first-class member for the same reason: preservation is
 * a decision, and a section doing its job should be marked protected rather
 * than improved at.
 */
export type AnalysisOperation = {
  type: OperationType;
  targetSegmentIds: string[];
  /** Where a move or merge lands. */
  destinationSegmentId?: string | null;
  /** For replace / rewrite. */
  replacementText?: string | null;
  /** For add_* and split — the new line(s), in order. */
  insertedText?: string[] | null;
  /** For operations no editor can perform mechanically. */
  instructions?: string | null;
};

/** Which operations this app can carry out on the script by itself. */
export const MECHANICAL_OPERATIONS: OperationType[] = [
  "cut",
  "move",
  "merge",
  "split",
  "replace",
  "rewrite",
  "add_beat",
  "add_hook",
  "add_rehook",
];

export type Evidence = {
  segmentIds: string[];
  quote: string;
  startIndex: number;
  endIndex: number;
};

export type LibraryReference = {
  libraryElementId: string;
  sourceId: string | null;
  name: string;
  category: string;
  categoryLabel: string;
  isPrimary: boolean;
  relevance: number;
  supportingText: string;
};

export type Priority = "structural" | "high" | "medium" | "polish";
export type FindingState = "pending" | "accepted" | "rejected" | "applied" | "stale";

export type AnalysisFinding = {
  id: string;
  scope: "local" | "structural";
  priority: Priority;
  confidence: number;

  /** DETECTION — arrived at before any mechanism was consulted. */
  diagnosis: { type: string; explanation: string };

  /** Every quote validated as really present in the analysed script. */
  evidence: Evidence[];

  /** GROUNDING — real component ids, with verifiable excerpts. */
  libraryReferences: LibraryReference[];

  reasoning: { whyApplicable: string; intendedEffect: string };

  /** PRESCRIPTION. */
  operation: AnalysisOperation;

  state: FindingState;
  edited: boolean;
  appliedText: string | null;
};

export type StoryBeatNode = {
  id: string;
  segmentIds: string[];
  function: string;
  summary: string;
  libraryElementIds: string[];
};

/**
 * The developer trace.
 *
 * Its whole reason to exist is settling one question that cannot be answered
 * from the output alone: did the library shape the recommendation, or did the
 * model decide and get a citation attached afterwards? So it records the query,
 * every candidate with its score, and what happened to each — including the
 * ones the model turned down and the findings validation threw away.
 */
export type RetrievalTrace = {
  observationIndex: number;
  detectedFunction: string;
  detectedConcern: string;
  segmentIds: string[];
  retrievalQuery: string;
  area: string | null;
  candidates: {
    libraryElementId: string;
    sourceId: string | null;
    name: string;
    relevance: number;
    matchedTerms: string[];
    citable: boolean;
  }[];
  selectedId: string | null;
  rejectedIds: string[];
  modelConfidence: number | null;
  validation: { ok: boolean; failures: string[] };
};

export type AnalysisResult = {
  runId: string;
  scriptVersionId: string;
  createdAt: string;
  model: string;
  findings: AnalysisFinding[];
  storyMap: StoryBeatNode[];
  summary: { strongestElements: string[]; highestLeverageFindingIds: string[] };
  trace: RetrievalTrace[];
  coverage: { libraryTotal: number; libraryCitable: number };
  /** True when the script has moved on since this run. */
  stale: boolean;
};

export const PRIORITY_ORDER: Record<Priority, number> = {
  structural: 0,
  high: 1,
  medium: 2,
  polish: 3,
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  structural: "STRUCTURAL",
  high: "HIGH",
  medium: "MEDIUM",
  polish: "POLISH",
};

export const OPERATION_LABEL: Record<OperationType, string> = {
  keep: "Keep",
  cut: "Cut",
  move: "Move",
  merge: "Merge",
  split: "Split",
  replace: "Replace",
  rewrite: "Rewrite",
  reorder: "Reorder",
  add_beat: "Add beat",
  add_visual: "Add visual",
  add_hook: "Add hook",
  add_rehook: "Add re-hook",
  change_lens: "Change lens",
  callback: "Add callback",
};
