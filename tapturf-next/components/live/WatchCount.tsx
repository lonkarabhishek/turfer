import { Eye } from "lucide-react";
import { watchLabel, type Watchers } from "./watch";

const TONES = {
  /** On the dark score header (white text). */
  dark: "bg-white/15 text-white",
  /** On a white or light card. */
  light: "bg-primary-100 text-primary-700",
} as const;

/**
 * The eye and how many people have the score open, next to the LIVE
 * badge. Nothing while the count is unknown (null) or 0: the scorer alone
 * is not "watching". Not a button, so it needs no tap target.
 */
export function WatchCount({ watchers, tone, className = "" }: { watchers: Watchers | null; tone: "dark" | "light"; className?: string }) {
  if (!watchers || watchers.count <= 0) return null;
  const { text, aria } = watchLabel(watchers);
  return (
    <span role="img" aria-label={aria} title={aria} className={`shrink-0 inline-flex items-center gap-0.5 h-5 px-1.5 rounded-full text-[11px] font-bold tabular-nums ${TONES[tone]} ${className}`}>
      <Eye className="w-3 h-3" aria-hidden />
      <span aria-hidden>{text}</span>
    </span>
  );
}
