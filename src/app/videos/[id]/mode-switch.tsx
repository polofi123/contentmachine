"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// MAKE, STUDY, EDIT and SHIP are four views of the same video, not four
// records — so this is a switch, not a wizard step. Nothing is gated, nothing
// has to be finished first, and you can sit in any of them for as long as you
// like.
//
// STUDY sits between the first two on purpose: you write, you find out what the
// script is doing against the framework, then you decide how to cut it. SHIP is
// last because it is the only one that is not a workspace — it is the script
// leaving the app, and the result coming back.
export function ModeSwitch({ videoId }: { videoId: string }) {
  const pathname = usePathname();
  const mode = pathname.endsWith("/edit")
    ? "edit"
    : pathname.endsWith("/analysis")
      ? "analysis"
      : pathname.endsWith("/ship")
        ? "ship"
        : "make";

  const tab = (active: boolean) =>
    `rounded-md px-3 py-1 text-[11px] tracking-wide transition-colors ${
      active ? "bg-accent-dim/20 text-accent" : "text-ink-faint hover:text-ink-dim"
    }`;

  return (
    <nav className="flex shrink-0 gap-0.5 rounded-lg border border-border-soft p-0.5">
      <Link href={`/videos/${videoId}/make`} className={tab(mode === "make")}>
        MAKE
      </Link>
      <Link href={`/videos/${videoId}/analysis`} className={tab(mode === "analysis")}>
        STUDY
      </Link>
      <Link href={`/videos/${videoId}/edit`} className={tab(mode === "edit")}>
        EDIT
      </Link>
      <Link href={`/videos/${videoId}/ship`} className={tab(mode === "ship")}>
        SHIP
      </Link>
    </nav>
  );
}
