"use client";

import { useEffect, useId, useState } from "react";
import { embedUrl, normalizeVideoUrl } from "@/lib/platform";

// Watching a reference without leaving the app. The platform's own embed
// player, nothing downloaded — so a deleted or private video shows the
// platform's "unavailable" card, which is the honest answer anyway.
//
// Only one plays at a time: opening a player announces itself, and every other
// open player on the page closes. A list of twenty live iframes is a page that
// stops scrolling.

const EVENT = "cm:video-play";

export function VideoPlayer({
  url,
  title,
  startOpen = false,
  autoplay: autoplayOnOpen = false,
  className,
}: {
  url: string | null;
  title: string;
  /** Show the player straight away, with no button — for the workbench and the card modal. */
  startOpen?: boolean;
  /** With startOpen: start playing immediately (the viewer just clicked a card). */
  autoplay?: boolean;
  /** Replaces the default frame sizing. */
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(startOpen);
  const [autoplay, setAutoplay] = useState(autoplayOnOpen);

  useEffect(() => {
    const close = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== id) setOpen(false);
    };
    window.addEventListener(EVENT, close);
    return () => window.removeEventListener(EVENT, close);
  }, [id]);

  const src = embedUrl(url, autoplay);
  if (!src) return null;
  const isInstagram = normalizeVideoUrl(url ?? "")?.platform === "instagram";

  function play() {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: id }));
    setAutoplay(true);
    setOpen(true);
  }

  return (
    <div>
      {!startOpen && (
        <button
          type="button"
          onClick={() => (open ? setOpen(false) : play())}
          aria-expanded={open}
          className="rounded-md border border-border px-2 py-0.5 text-[11px] text-ink-dim transition-colors hover:border-accent-dim hover:text-accent"
        >
          {open ? "■ Close" : "▶ Play"}
        </button>
      )}
      {open && (
        <iframe
          src={src}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className={`block w-full rounded-lg border border-border bg-surface-2 ${
            className ??
            // Instagram wraps the reel in its own header and caption, so it
            // needs more height than the bare 9:16 frame.
            (isInstagram ? "mt-2 h-[620px] max-w-[340px]" : "mt-2 aspect-[9/16] max-w-[300px]")
          }`}
        />
      )}
    </div>
  );
}
