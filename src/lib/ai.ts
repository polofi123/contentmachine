import Anthropic from "@anthropic-ai/sdk";

// The one place that talks to Claude.
//
// Everything the storytelling panel asks for comes back as structured JSON
// against a schema, never as prose to be parsed. That is not fussiness: the
// panel renders observations attached to specific line numbers, and "usually
// returns something list-shaped" is how you get a panel that works until the
// day it doesn't.
//
// The AI is deliberately kept to the edge of this system. It reads the script
// and says what it sees; it does not write, does not rewrite, and does not
// touch the database. Diagnosis before rewriting — and rewriting only when the
// creator explicitly asks, in their own edit.

export const STORY_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";

/**
 * Whether the analysis is available at all.
 *
 * Checked before the button renders. A key is genuinely optional — every
 * deterministic observation in lib/story.ts works without one, and the panel is
 * useful with the AI switched off, so a missing key hides a feature rather than
 * breaking a page.
 */
export const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

let cached: Anthropic | null = null;

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set — add it to .env.local to use story analysis.");
  }
  cached ??= new Anthropic();
  return cached;
}

/**
 * The voice every prompt inherits.
 *
 * Written against this model's habits rather than in the abstract. Claude Opus
 * 5 writes longer than you want by default, verifies work nobody asked it to
 * verify, and widens the task while it is in there — so conciseness, scope and
 * "do not rewrite" are stated once here instead of being re-argued in each
 * prompt.
 *
 * The last rule is the load-bearing one. This system exists to help someone
 * write in their own voice; an assistant that hands back an improved script has
 * replaced the thing it was supposed to support.
 */
const HOUSE_RULES = `You are a sharp short-form script editor working inside a creator's own
writing tool. You are here to make the script better, not to describe it.

How to answer:
- TAKE A POSITION. Say whether something works or doesn't, and why. "This hook
  buries the interesting part" is useful; "the hook is 8 words long" is not.
- EVERY CRITICISM SHIPS WITH A FIX. If you say a line is weak, write the
  stronger version. An opinion with no replacement is noise.
- Be specific about location. Cite line numbers.
- Say nothing rather than pad. Three real calls beat eight thin ones. If
  something genuinely works, say so briefly and move on — do not manufacture
  problems to seem thorough.
- Do not hedge. No "consider maybe", no "you might want to". Say it.
- Do not verify or re-check your own work; do not describe your process.

WRITING IN THEIR VOICE — this matters more than anything else here:
- Match their register exactly. If they write casually, with slang, profanity,
  lowercase, run-ons or typos, your lines do too.
- Never upgrade their vocabulary. Never make it "professional", never make it
  marketing copy, never add words like "unlock", "dive in", "game changer",
  "here's the thing", "little did I know".
- Keep their sentence length and rhythm. Short choppy lines stay short.
- They are one person talking to camera. Write what a person says out loud, not
  what a brand writes.
- A line that is technically better but does not sound like them is a failure.`;

type JsonSchema = Record<string, unknown>;

/**
 * One prompt, one schema-shaped answer.
 *
 * Non-streaming with a modest `max_tokens`, which is the right shape here: the
 * answers are short structured lists, and the panel wants them whole rather
 * than arriving a word at a time behind a spinner.
 */
export async function askJson<T>({
  system,
  prompt,
  schema,
  maxTokens = 4000,
}: {
  system?: string;
  prompt: string;
  schema: JsonSchema;
  maxTokens?: number;
}): Promise<T> {
  const response = await client().beta.messages.create({
    model: STORY_MODEL,
    max_tokens: maxTokens,
    system: [HOUSE_RULES, system].filter(Boolean).join("\n\n"),
    messages: [{ role: "user", content: prompt }],

    // Adaptive is the default on this model; stated anyway so the intent
    // survives a model change that does not share that default.
    thinking: { type: "adaptive" },

    output_config: {
      // The work is one careful read of a page of text. `high` is the floor for
      // anything judgement-shaped, and `max` buys nothing on a task this size.
      effort: "high",
      format: { type: "json_schema", schema },
    },

    // This model's classifiers can decline a request outright. Left to itself
    // that returns a 200 with empty content and the panel shows nothing with no
    // explanation — so declined requests are re-run server-side on Anthropic's
    // recommended fallback instead of dying quietly.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });

  // Always before reading content: on a refusal `content` is empty or partial,
  // and indexing into it is how this becomes an unexplained crash.
  if (response.stop_reason === "refusal") {
    throw new Error("Claude declined to analyse this script.");
  }

  const text = response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();

  if (!text) throw new Error("Claude returned nothing to read.");

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Claude's answer was not in the expected shape.");
  }
}
