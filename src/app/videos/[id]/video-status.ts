// Plain module, for the same reason lego-options.ts is one: actions.ts carries
// "use server" and may only export async functions, and the forms that offer
// these values render on the client. A constant shared across both boundaries
// belongs in neither file.

/** The production statuses `videos.status` accepts — the CHECK from 0002. */
export const VIDEO_STATUSES = [
  "idea",
  "scripting",
  "shooting",
  "editing",
  "published",
  "abandoned",
] as const;

export type VideoStatus = (typeof VIDEO_STATUSES)[number];

/**
 * Narrows a posted status to the constraint.
 *
 * A `<select>` can only offer valid values, but a posted form is not a trusted
 * input — an unknown one would come back as a database error rather than as
 * the "leave it alone" the caller meant.
 */
export function isVideoStatus(value: string): value is VideoStatus {
  return (VIDEO_STATUSES as readonly string[]).includes(value);
}
