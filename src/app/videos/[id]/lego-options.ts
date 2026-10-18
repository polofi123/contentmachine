// Plain module on purpose — NOT "use client".
//
// slot-bodies.tsx carries the "use client" directive, and every export of a
// client module reaches a Server Component as a client *reference* rather than
// the value itself. Reading this table with Object.entries() from the server
// therefore returned nothing, and every options list came back empty. Constants
// shared across the boundary have to live outside it.

export type LegoField =
  | "lego_topic"
  | "lego_angle"
  | "lego_hook"
  | "lego_story_structure"
  | "lego_visual_format"
  | "lego_key_visuals"
  | "lego_audio";

export type LegoOption = { id: string; name: string; group: string };

/**
 * Which framework vocabulary belongs beside which Lego.
 *
 * The Legos are prose and stay prose — `videos.lego_*` describes what a video
 * DID, in your words, and works just as well for someone else's video. That is
 * a different fact from `video_components`, which names a technique from the
 * framework, and the two must not collapse into each other.
 *
 * But writing prose into blank boxes while 200 named options sit elsewhere in
 * the same app is silly. The options are shown to be read and borrowed from:
 * tapping one drops its name into the sentence. Recording it as a technique is
 * still the separate, structured act it has always been.
 *
 * Topic, angle and audio have no seeded vocabulary, so they stay plain boxes.
 */
/**
 * The six hook words, in the colours the framework draws them in.
 *
 * Keyed by source_id rather than name so renaming a component in /library — the
 * whole point of source_id — does not silently drop its colour.
 *
 * Values are literal hex rather than theme tokens because these ARE the
 * framework's own colours, not this app's palette; they should read the same
 * here as they do on the sheet they came from.
 */
export const WORD_TYPE_COLORS: Record<string, string> = {
  "HOOKW-01": "#d98cc8", // Subject Clarity
  "HOOKW-02": "#e59a86", // Action
  "HOOKW-03": "#c9a86a", // Objective / End State
  "HOOKW-04": "#6fbf9f", // Contrast
  "HOOKW-05": "#9b8cd9", // Time
  "HOOKW-06": "#7fb2d9", // Proof
};

// LABEL_TEACHES lived here and has moved to story-vocab.ts as ROLE_TEACHES.
//
// It was keyed by the free-text label the skeleton gave a line, which meant a
// line only taught anything while nobody had renamed it — and planting a
// technique renamed it. Keying by story_role instead means the mapping cannot
// be broken by a typo or silently lost by tagging.

/**
 * Roles whose words can be tagged, and the layer of types they tag with.
 *
 * Keyed by story_role now, for the same reason as ROLE_TEACHES.
 */
export const WORD_TAGGABLE: Record<string, string> = {
  hook: "hook_word",
};

export const LEGO_OPTION_LAYERS: Partial<Record<LegoField, string[]>> = {
  lego_hook: ["hook", "spoken_hook", "visual_hook", "hook_modifier"],
  lego_story_structure: ["story_format", "story_loop", "story"],
  lego_visual_format: ["format", "visual_layout"],
  lego_key_visuals: ["visual_hook"],
};
