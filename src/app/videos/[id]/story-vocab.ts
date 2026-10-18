// Plain module on purpose — NOT "use client".
//
// Same reason as lego-options.ts: every export of a "use client" module reaches
// a Server Component as a client *reference* rather than the value, so a table
// read from the server would come back empty. Constants shared across the
// boundary have to live outside it.

/**
 * What a beat is FOR in this story.
 *
 * The vocabulary mirrors script_beats.story_role exactly. Keeping the two in
 * sync by hand is the price of a constrained column rather than a table, and
 * it is the right trade while the list is this small and this structural —
 * these are the parts a story is made of, not techniques someone might invent
 * a new one of tomorrow. (Techniques ARE extensible: they are components, and
 * they attach to a beat separately. Do not confuse the two.)
 */
export const STORY_ROLES = [
  "hook",
  "foreshadow",
  "transition",
  "context",
  "stakes",
  "question",
  "conflict",
  "example",
  "twist",
  "rehook",
  "reveal",
  "payoff",
  "meaning",
  "cta",
] as const;

export type StoryRole = (typeof STORY_ROLES)[number];

/**
 * One line each, shown in the role picker.
 *
 * Phrased as what the line DOES to the viewer, not as a definition, because
 * that is the question you are actually answering when you pick one.
 */
export const ROLE_HINT: Record<StoryRole, string> = {
  hook: "Stops the scroll.",
  foreshadow: "Promises something specific, later.",
  transition: "Carries them across without going flat.",
  context: "What they need in order to follow it.",
  stakes: "Who, what could be lost, why now.",
  question: "The thing they now need answered.",
  conflict: "The thing in the way.",
  example: "Analogy, comparison, or a mini-story.",
  twist: "What they expected, replaced — logically.",
  rehook: "Closes one loop while opening another.",
  reveal: "The answer, or part of it.",
  payoff: "The thing they stayed for.",
  meaning: "Why any of it mattered.",
  cta: "What to do now.",
};

/**
 * Which part of the framework a role teaches from.
 *
 * Read by the guide panel: stand on a line marked REHOOK and HACK-02 appears
 * beside it. Keyed by role rather than by free text, so relabelling a line can
 * never silently lose its teaching the way a typo in a label could.
 */
export const ROLE_TEACHES: Record<StoryRole, string> = {
  hook: "HOOK-02",
  foreshadow: "STORY-16",
  transition: "STORY-18",
  context: "SCR-03",
  stakes: "LOOP-01",
  question: "LOOP-02",
  conflict: "TEN-10",
  example: "STORY-09",
  twist: "LOOP-03",
  rehook: "HACK-02",
  reveal: "SCR-02",
  payoff: "SCR-02",
  meaning: "STORY-11",
  cta: "CTA-01",
};

/**
 * How a line follows the one above it.
 *
 * Mirrors script_beats.dance_relation. These are RELATIONSHIPS, not words you
 * have to write — marking a line "but" does not mean the sentence starts with
 * "but", it means the sentence pushes against the one before it.
 *
 * `null` is the common case and means "not said". It is deliberately not the
 * same as an and-then; the diagnostics report long runs of it as a place worth
 * looking, never as something wrong.
 */
export const DANCE_RELATIONS = [
  "therefore",
  "but",
  "because",
  "despite",
  "however",
  "which_means",
  "until",
  "except",
  "so",
] as const;

export type DanceRelation = (typeof DANCE_RELATIONS)[number];

/** The connector spelled the way a person says it. */
export const DANCE_LABEL: Record<DanceRelation, string> = {
  therefore: "therefore",
  but: "but",
  because: "because",
  despite: "despite",
  however: "however",
  which_means: "which means",
  until: "until",
  except: "except",
  so: "so",
};

/**
 * The two relations that actually carry a story forward.
 *
 * Everything in DANCE_RELATIONS is a real connection, but consequence and
 * reversal are the pair that turn a list of facts into a sequence — the rest
 * mostly qualify. The diagnostics count these separately for that reason.
 */
export const DANCE_DRIVERS: DanceRelation[] = ["therefore", "but"];

/** How far a lens sits from the obvious reading. Provenance, not a ranking. */
export const LENS_TIERS = ["obvious", "less_obvious", "unexpected"] as const;

export type LensTier = (typeof LENS_TIERS)[number];

export const LENS_TIER_LABEL: Record<LensTier, string> = {
  obvious: "Obvious",
  less_obvious: "Less obvious",
  unexpected: "Unexpected",
};

export type StoryTense = "present" | "past";

/**
 * The nine things worth asking Claude for at a specific spot.
 *
 * Lives here rather than beside the prompts because a "use server" module can
 * only export async functions — a label map exported from one is a build error.
 * The prompts themselves stay server-side; only their names cross over.
 *
 * Every one is a question about ONE PLACE. That is what keeps them useful:
 * "three stronger lenses" is a move you make with a script in front of you,
 * where "improve my script" is a slot machine.
 */
export const SUGGESTION_KINDS = [
  "lenses",
  "rehook",
  "specific",
  "question",
  "dance",
  "cliffhangers",
  "meaning",
  "value",
  "ministory",
] as const;

export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

export const SUGGESTION_LABEL: Record<SuggestionKind, string> = {
  lenses: "3 stronger lenses",
  rehook: "Re-hook here",
  specific: "Make this specific",
  question: "What question could this open?",
  dance: "Connect these beats",
  cliffhangers: "3 mini-cliffhangers",
  meaning: "What could this mean?",
  value: "Faster route to value",
  ministory: "Turn this into a mini-story",
};

/** The ones that only make sense with the caret on a line. */
export const BEAT_SUGGESTIONS: SuggestionKind[] = [
  "rehook",
  "specific",
  "question",
  "dance",
  "cliffhangers",
  "ministory",
];

export const isStoryRole = (v: string | null | undefined): v is StoryRole =>
  !!v && (STORY_ROLES as readonly string[]).includes(v);

export const isDanceRelation = (v: string | null | undefined): v is DanceRelation =>
  !!v && (DANCE_RELATIONS as readonly string[]).includes(v);
