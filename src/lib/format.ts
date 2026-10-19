// Display formatting for reference cards. Pure, so server and client agree.

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

/** 1834000 → "1.8M", 481200 → "481.2K". */
export function compactNumber(n: number): string {
  return compact.format(n);
}

/** How long ago, in the coarse units a feed uses: "3d ago", "4mo ago", "1y ago". */
export function timeAgo(iso: string, now = Date.now()): string {
  const days = Math.max(0, (now - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return "today";
  if (days < 30) return `${Math.floor(days)}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** Views ÷ channel average (MINE-02), as the "12.3x" a card shows. */
export function outlierScore(views: number | null, channelAvg: number | null): number | null {
  if (!views || !channelAvg) return null;
  return Math.round((views / channelAvg) * 10) / 10;
}
