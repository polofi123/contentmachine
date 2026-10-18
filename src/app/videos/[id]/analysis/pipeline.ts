import "server-only";

import { askJson } from "@/lib/ai";
import {
  bestExcerpt,
  buildIndex,
  excerptIsGrounded,
  retrieve,
  toElement,
  type Candidate,
  type LibraryElement,
  type LibraryIndex,
} from "@/lib/library";
import { locateQuote, scriptForModel, type SegmentedScript } from "@/lib/segment";
import {
  OPERATION_TYPES,
  type AnalysisOperation,
  type Evidence,
  type LibraryReference,
  type OperationType,
  type Priority,
  type RetrievalTrace,
  type StoryBeatNode,
} from "@/lib/analysis";

// The engine.
//
// The order of the stages is the entire point, so it is worth stating plainly
// what this must never become:
//
//   WRONG   model writes criticism → search library → staple on nearest match
//   RIGHT   read the script → retrieve mechanisms → compare → then recommend
//
// The difference is enforced structurally, not by instruction. Pass A is given
// no mechanisms at all and is forbidden from proposing anything — it can only
// describe what is happening and say what to go and look up. Retrieval then
// runs in TypeScript. Pass B never sees the library as a whole: for each
// observation it sees only the handful of elements retrieval returned, and can
// cite nothing else, because validation checks the id it picked against that
// exact candidate list.
//
// A model that wanted to decide first and cite afterwards has no route to do
// it here — by the time it can make a recommendation, the mechanisms are
// already chosen and finite.

const AREAS = [
  "hook",
  "direction",
  "lens",
  "tension",
  "dance",
  "loops",
  "rhythm",
  "specificity",
  "value",
  "meaning",
  "visual",
] as const;

/* ===================================================================== */
/* PASS A — DETECTION. No library. No advice.                            */
/* ===================================================================== */

type Observation = {
  segmentIds: string[];
  area: string;
  detectedFunction: string;
  whatIsHappening: string;
  concern: string;
  retrievalQuery: string;
  scope: "local" | "structural";
};

type DetectionResult = {
  storyMap: { segmentIds: string[]; function: string; summary: string }[];
  viewerState: {
    atSegmentId: string;
    knows: string[];
    wonders: string[];
    unresolved: string[];
  }[];
  relationships: { fromSegmentId: string; toSegmentId: string; relationship: string }[];
  observations: Observation[];
};

const DETECTION_SCHEMA = {
  type: "object",
  properties: {
    storyMap: {
      type: "array",
      items: {
        type: "object",
        properties: {
          segmentIds: { type: "array", items: { type: "string" } },
          function: { type: "string" },
          summary: { type: "string" },
        },
        required: ["segmentIds", "function", "summary"],
        additionalProperties: false,
      },
    },
    viewerState: {
      type: "array",
      items: {
        type: "object",
        properties: {
          atSegmentId: { type: "string" },
          knows: { type: "array", items: { type: "string" } },
          wonders: { type: "array", items: { type: "string" } },
          unresolved: { type: "array", items: { type: "string" } },
        },
        required: ["atSegmentId", "knows", "wonders", "unresolved"],
        additionalProperties: false,
      },
    },
    relationships: {
      type: "array",
      items: {
        type: "object",
        properties: {
          fromSegmentId: { type: "string" },
          toSegmentId: { type: "string" },
          relationship: {
            type: "string",
            enum: [
              "causes",
              "contrasts",
              "complicates",
              "resolves",
              "reveals",
              "supports",
              "repeats",
              "explains",
              "continues",
              "unrelated",
            ],
          },
        },
        required: ["fromSegmentId", "toSegmentId", "relationship"],
        additionalProperties: false,
      },
    },
    observations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          segmentIds: { type: "array", items: { type: "string" } },
          area: { type: "string", enum: AREAS },
          detectedFunction: { type: "string" },
          whatIsHappening: { type: "string" },
          concern: { type: "string" },
          retrievalQuery: { type: "string" },
          scope: { type: "string", enum: ["local", "structural"] },
        },
        required: [
          "segmentIds",
          "area",
          "detectedFunction",
          "whatIsHappening",
          "concern",
          "retrievalQuery",
          "scope",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["storyMap", "viewerState", "relationships", "observations"],
  additionalProperties: false,
} as const;

const DETECTION_SYSTEM = `You are the DETECTION stage of a script analysis engine.

You do not give advice. You do not suggest fixes. You do not name storytelling
techniques or frameworks. A later stage will retrieve the relevant mechanisms
from a real library and decide what to do — your job is only to establish, from
the script itself, what is happening to the viewer and where.

If you propose a solution you have broken the pipeline: the mechanism must be
chosen from the library AFTER you report, not implied by you before it.

For each observation, "retrievalQuery" is a short search query describing the
storytelling situation in plain terms — the function of the section and what is
going wrong with the viewer's attention or knowledge. Write it to find a
technique in a storytelling library. Do not put a technique's name in it.`;

async function detect(
  script: SegmentedScript,
  context: string,
): Promise<DetectionResult> {
  const prompt = `${context}

SCRIPT — each line is prefixed with its segment id in brackets:
${scriptForModel(script)}

Do three things.

1. STORY MAP — group the lines into the beats this script actually has. Use its
   real shape; do not force it into a template. One entry per beat, naming the
   function it performs and summarising it.

2. VIEWER STATE — at each beat boundary, what the viewer now knows, what they
   are wondering, and what is still unresolved. This is how you tell a real
   attention problem from a sentence you dislike.

3. OBSERVATIONS — up to 8 places where something notable is happening to the
   viewer's attention, knowledge, or the causal progression. For each: which
   segments, which area, what function that section is serving, what is actually
   happening, and the concern in neutral terms.

   scope: "local" for one contiguous stretch; "structural" when the observation
   is about a relationship between separated parts — a reveal placed after the
   thing it explains, a setup with no payoff, information ordered wrongly.

   Include sections that are working, not only problems — a section performing
   its function well is a real observation and the next stage may decide it
   should be protected rather than changed.

Report only. Recommend nothing.`;

  return askJson<DetectionResult>({
    system: DETECTION_SYSTEM,
    prompt,
    schema: DETECTION_SCHEMA,
    maxTokens: 8000,
  });
}

/* ===================================================================== */
/* PASS B — GROUNDING. Only the retrieved candidates exist.              */
/* ===================================================================== */

type GroundedFinding = {
  observationIndex: number;
  applies: boolean;
  libraryElementId: string;
  alternativeLibraryElementId: string | null;
  supportingText: string;
  quotes: string[];
  diagnosisType: string;
  diagnosis: string;
  whyApplicable: string;
  intendedEffect: string;
  priority: Priority;
  confidence: number;
  operation: {
    type: OperationType;
    targetSegmentIds: string[];
    destinationSegmentId: string | null;
    replacementText: string | null;
    insertedText: string[] | null;
    instructions: string | null;
  };
};

const GROUNDING_SCHEMA = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          observationIndex: { type: "integer" },
          applies: { type: "boolean" },
          libraryElementId: { type: "string" },
          alternativeLibraryElementId: { type: ["string", "null"] },
          supportingText: { type: "string" },
          quotes: { type: "array", items: { type: "string" } },
          diagnosisType: { type: "string" },
          diagnosis: { type: "string" },
          whyApplicable: { type: "string" },
          intendedEffect: { type: "string" },
          priority: { type: "string", enum: ["structural", "high", "medium", "polish"] },
          confidence: { type: "number" },
          operation: {
            type: "object",
            properties: {
              type: { type: "string", enum: OPERATION_TYPES },
              targetSegmentIds: { type: "array", items: { type: "string" } },
              destinationSegmentId: { type: ["string", "null"] },
              replacementText: { type: ["string", "null"] },
              insertedText: { type: ["array", "null"], items: { type: "string" } },
              instructions: { type: ["string", "null"] },
            },
            required: [
              "type",
              "targetSegmentIds",
              "destinationSegmentId",
              "replacementText",
              "insertedText",
              "instructions",
            ],
            additionalProperties: false,
          },
        },
        required: [
          "observationIndex",
          "applies",
          "libraryElementId",
          "alternativeLibraryElementId",
          "supportingText",
          "quotes",
          "diagnosisType",
          "diagnosis",
          "whyApplicable",
          "intendedEffect",
          "priority",
          "confidence",
          "operation",
        ],
        additionalProperties: false,
      },
    },
    strongestElements: { type: "array", items: { type: "string" } },
  },
  required: ["findings", "strongestElements"],
  additionalProperties: false,
} as const;

const GROUNDING_SYSTEM = `You are the GROUNDING stage of a script analysis engine.

For each observation you are given a short list of mechanisms retrieved from
this creator's own storytelling library, with their real ids and their real
text. These are the only mechanisms that exist for you. You may not cite,
mention, or rely on any technique that is not in the list for that observation —
there is no general storytelling knowledge available to you here.

For each observation, decide honestly:

- Does one of these mechanisms genuinely explain or address what was detected?
  If yes, set applies=true and build the finding on it.
- If none of them fits, set applies=false. Saying "nothing in the library
  addresses this" is a correct and useful answer. Do not stretch a mechanism to
  cover a section it does not really speak to.

RULES THAT DECIDE WHETHER YOUR FINDING IS ACCEPTED:

- libraryElementId MUST be one of the ids offered for that observation.
- supportingText MUST be copied verbatim from that element's text. Not a
  paraphrase, not a summary — the exact words, and only the part that justifies
  the point. It is checked against the source.
- quotes MUST be copied verbatim from the script. Exact substrings. They are
  checked. A paraphrased quote fails.
- operation.targetSegmentIds MUST be segment ids that exist.

CHOOSE THE LEAST DESTRUCTIVE USEFUL OPERATION. A mechanism applying does not
mean text must be rewritten. If the problem is order, use move or reorder. If
it is duplication, use merge or cut. If a section already performs its function,
use keep — that marks it protected, and is a real result.

Only offer alternativeLibraryElementId when it would lead to a materially
different creative direction. Two ways of doing the same thing is fake choice —
use null.

For rewrite/replace, replacementText must match the creator's voice exactly:
their register, slang, punctuation, sentence length. Never make it polished or
professional.`;

function candidateBlock(candidates: Candidate[]): string {
  return candidates
    .map(
      (c) =>
        `  id: ${c.element.id}\n` +
        `  name: ${c.element.name}${c.element.sourceId ? ` (${c.element.sourceId})` : ""}\n` +
        `  category: ${c.element.categoryLabel}\n` +
        `  text: """${c.element.sourceText.trim()}"""`,
    )
    .join("\n\n");
}

/* ===================================================================== */
/* THE RUN                                                               */
/* ===================================================================== */

export type PipelineOutput = {
  findings: {
    scope: "local" | "structural";
    priority: Priority;
    confidence: number;
    diagnosisType: string;
    diagnosis: string;
    evidence: Evidence[];
    whyApplicable: string;
    intendedEffect: string;
    operation: AnalysisOperation;
    references: LibraryReference[];
  }[];
  storyMap: StoryBeatNode[];
  summary: { strongestElements: string[]; highestLeverageFindingIds: string[] };
  trace: RetrievalTrace[];
  coverage: { libraryTotal: number; libraryCitable: number };
};

export function libraryIndexFrom(
  rows: { id: string; source_id: string | null; name: string; body: string | null; layer_id: string | null; parent_id: string | null }[],
  layerLabels: Map<string, string>,
): { index: LibraryIndex; elements: LibraryElement[] } {
  const elements = rows.map((r) => toElement(r, layerLabels.get(r.layer_id ?? "") ?? "Other"));
  return { index: buildIndex(elements), elements };
}

export async function runPipeline({
  script,
  context,
  index,
}: {
  script: SegmentedScript;
  context: string;
  index: LibraryIndex;
}): Promise<PipelineOutput> {
  const segmentIds = new Set(script.segments.map((s) => s.id));

  /* ---- stage 1: detection, with no library in sight ------------------ */
  const detection = await detect(script, context);

  const observations = (detection.observations ?? []).filter((o) =>
    o.segmentIds.some((id) => segmentIds.has(id)),
  );

  /* ---- stage 2: retrieval, in TypeScript ----------------------------- */
  const retrieved = observations.map((o) => {
    const query = `${o.retrievalQuery} ${o.detectedFunction} ${o.concern}`;
    return {
      observation: o,
      // Only citable elements may be a primary mechanism — an element with no
      // body cannot produce a verifiable excerpt, and a citation nobody can
      // check is the exact failure this engine is built to prevent.
      candidates: retrieve(index, query, { limit: 6, area: o.area, citableOnly: true }),
      query,
    };
  });

  const usable = retrieved.filter((r) => r.candidates.length > 0);

  /* ---- stage 3: grounding, against those candidates only ------------- */
  let grounded: { findings: GroundedFinding[]; strongestElements: string[] } = {
    findings: [],
    strongestElements: [],
  };

  if (usable.length > 0) {
    const blocks = usable
      .map((r, i) => {
        const seg = r.observation.segmentIds
          .map((id) => script.segments.find((s) => s.id === id))
          .filter(Boolean)
          .map((s) => `    [${s!.id}] ${s!.order}. ${s!.text}`)
          .join("\n");

        return `OBSERVATION ${i}
  area: ${r.observation.area}
  scope: ${r.observation.scope}
  function detected: ${r.observation.detectedFunction}
  what is happening: ${r.observation.whatIsHappening}
  concern: ${r.observation.concern}
  script:
${seg}

  MECHANISMS RETRIEVED FROM THE LIBRARY FOR THIS OBSERVATION — you may cite only these:

${candidateBlock(r.candidates)}`;
      })
      .join("\n\n────────────────────────────────────────\n\n");

    grounded = await askJson<{ findings: GroundedFinding[]; strongestElements: string[] }>({
      system: GROUNDING_SYSTEM,
      prompt: `${context}

FULL SCRIPT for reference — quotes must be exact substrings of these lines:
${scriptForModel(script)}

${blocks}

For each observation, produce one finding. Set applies=false where no retrieved
mechanism genuinely fits. Also name the strongest elements of this script as
plain sentences in strongestElements.`,
      schema: GROUNDING_SCHEMA,
      maxTokens: 12000,
    });
  }

  /* ---- stage 4: validation — nothing ungrounded gets through --------- */
  const byId = new Map(index.elements.map((e) => [e.id, e]));
  const output: PipelineOutput["findings"] = [];
  const trace: RetrievalTrace[] = [];

  usable.forEach((r, i) => {
    const finding = (grounded.findings ?? []).find((f) => f.observationIndex === i);
    const failures: string[] = [];

    const traceRow: RetrievalTrace = {
      observationIndex: i,
      detectedFunction: r.observation.detectedFunction,
      detectedConcern: r.observation.concern,
      segmentIds: r.observation.segmentIds,
      retrievalQuery: r.query,
      area: r.observation.area,
      candidates: r.candidates.map((c) => ({
        libraryElementId: c.element.id,
        sourceId: c.element.sourceId,
        name: c.element.name,
        relevance: c.relevance,
        matchedTerms: c.matched,
        citable: c.element.citable,
      })),
      selectedId: null,
      rejectedIds: r.candidates.map((c) => c.element.id),
      modelConfidence: finding?.confidence ?? null,
      validation: { ok: false, failures },
    };

    if (!finding) {
      failures.push("no finding returned for this observation");
      trace.push(traceRow);
      return;
    }
    if (!finding.applies) {
      failures.push("model reported no retrieved mechanism fits");
      trace.push(traceRow);
      return;
    }

    // (a) the cited element must be one we actually offered
    const offered = r.candidates.find((c) => c.element.id === finding.libraryElementId);
    if (!offered) {
      failures.push(`cited element ${finding.libraryElementId} was not among the candidates`);
      trace.push(traceRow);
      return;
    }
    const element = byId.get(finding.libraryElementId)!;

    // (b) the excerpt must really come from it
    if (!excerptIsGrounded(element, finding.supportingText)) {
      failures.push("supportingText is not present in the cited element");
    }

    // (c) every quote must really be in the script
    const evidence: Evidence[] = [];
    for (const quote of finding.quotes ?? []) {
      const at = locateQuote(script, quote);
      if (!at) {
        failures.push(`quote not found in script: "${quote.slice(0, 40)}…"`);
        continue;
      }
      evidence.push({ ...at, quote: script.content.slice(at.startIndex, at.endIndex) });
    }
    if (evidence.length === 0) failures.push("no verifiable evidence");

    // (d) the operation must target real segments and carry what its type needs
    const op = finding.operation;
    const targets = (op?.targetSegmentIds ?? []).filter((id) => segmentIds.has(id));
    if (!op || !OPERATION_TYPES.includes(op.type)) failures.push("unknown operation type");
    if (targets.length === 0) failures.push("operation targets no valid segment");
    if (
      (op?.type === "replace" || op?.type === "rewrite") &&
      !(op.replacementText ?? "").trim()
    ) {
      failures.push(`${op.type} with no replacement text`);
    }
    if (
      (op?.type === "add_beat" || op?.type === "add_hook" || op?.type === "add_rehook") &&
      !(op.insertedText ?? []).some((t) => t.trim())
    ) {
      failures.push(`${op.type} with nothing to insert`);
    }
    if (op?.type === "move" && !op.destinationSegmentId) {
      failures.push("move with no destination");
    }

    if (failures.length > 0) {
      trace.push(traceRow);
      return;
    }

    // Passed. Record what was chosen and what was turned down.
    traceRow.selectedId = element.id;
    traceRow.rejectedIds = r.candidates
      .map((c) => c.element.id)
      .filter((id) => id !== element.id);
    traceRow.validation = { ok: true, failures: [] };
    trace.push(traceRow);

    const references: LibraryReference[] = [
      {
        libraryElementId: element.id,
        sourceId: element.sourceId,
        name: element.name,
        category: element.category,
        categoryLabel: element.categoryLabel,
        isPrimary: true,
        relevance: offered.relevance,
        supportingText: finding.supportingText.trim(),
      },
    ];

    // An alternative only survives if it too was retrieved and is citable.
    const alt = r.candidates.find(
      (c) => c.element.id === finding.alternativeLibraryElementId && c.element.id !== element.id,
    );
    if (alt) {
      references.push({
        libraryElementId: alt.element.id,
        sourceId: alt.element.sourceId,
        name: alt.element.name,
        category: alt.element.category,
        categoryLabel: alt.element.categoryLabel,
        isPrimary: false,
        relevance: alt.relevance,
        supportingText: bestExcerpt(alt.element, r.query),
      });
    }

    output.push({
      scope: r.observation.scope === "structural" ? "structural" : "local",
      priority: finding.priority,
      confidence: Math.max(0, Math.min(1, finding.confidence ?? 0.5)),
      diagnosisType: finding.diagnosisType,
      diagnosis: finding.diagnosis,
      evidence,
      whyApplicable: finding.whyApplicable,
      intendedEffect: finding.intendedEffect,
      operation: {
        type: op.type,
        targetSegmentIds: targets,
        destinationSegmentId: op.destinationSegmentId ?? null,
        replacementText: op.replacementText ?? null,
        insertedText: op.insertedText ?? null,
        instructions: op.instructions ?? null,
      },
      references,
    });
  });

  // Observations retrieval could not serve at all still belong in the trace —
  // "the library has nothing on this" is a finding about the library.
  retrieved
    .filter((r) => r.candidates.length === 0)
    .forEach((r) => {
      trace.push({
        observationIndex: -1,
        detectedFunction: r.observation.detectedFunction,
        detectedConcern: r.observation.concern,
        segmentIds: r.observation.segmentIds,
        retrievalQuery: r.query,
        area: r.observation.area,
        candidates: [],
        selectedId: null,
        rejectedIds: [],
        modelConfidence: null,
        validation: { ok: false, failures: ["retrieval returned no citable candidates"] },
      });
    });

  const storyMap: StoryBeatNode[] = (detection.storyMap ?? []).map((b, i) => ({
    id: `beat-${i + 1}`,
    segmentIds: b.segmentIds.filter((id) => segmentIds.has(id)),
    function: b.function,
    summary: b.summary,
    libraryElementIds: output
      .filter((f) => f.evidence.some((e) => e.segmentIds.some((s) => b.segmentIds.includes(s))))
      .map((f) => f.references[0].libraryElementId),
  }));

  return {
    findings: output,
    storyMap,
    summary: { strongestElements: grounded.strongestElements ?? [], highestLeverageFindingIds: [] },
    trace,
    coverage: {
      libraryTotal: index.elements.length,
      libraryCitable: index.elements.filter((e) => e.citable).length,
    },
  };
}
