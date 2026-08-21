"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// MAKE and EDIT are two views of the same video, not two records — so this is a
// switch, not a wizard step. Nothing is gated, nothing has to be finished first,
// and you can sit in either one for as long as you like.
export function ModeSwitch({ videoId }: { videoId: string }) {
  const pathname = usePathname();
  const mode = pathname.endsWith("/edit") ? "edit" : "make";

  const tab = (active: boolean) =>
    `rounded-md px-3 py-1 text-[11px] tracking-wide transition-colors ${
      active ? "bg-accent-dim/20 text-accent" : "text-ink-faint hover:text-ink-dim"
    }`;

  return (
    <nav className="flex shrink-0 gap-0.5 rounded-lg border border-border-soft p-0.5">
      <Link href={`/videos/${videoId}/make`} className={tab(mode === "make")}>
        MAKE
      </Link>
      <Link href={`/videos/${videoId}/edit`} className={tab(mode === "edit")}>
        EDIT
      </Link>
    </nav>
  );
}
