import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function StatTile({
  label,
  value,
  sub,
  tone = "default",
  href,
  compact = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "default" | "accent" | "hot";
  /** Where the number's underlying records are listed (/admin/<view>). */
  href?: string;
  /** Smaller value text, for words (a name) rather than a number. */
  compact?: boolean;
}) {
  const bg =
    tone === "accent"
      ? "bg-accent-500 text-white"
      : tone === "hot"
        ? "bg-hot-500 text-white"
        : "bg-white border border-primary-200 text-primary-900";
  const labelColor = tone === "default" ? "text-primary-500" : "text-white/80";
  const subColor = tone === "default" ? "text-primary-500" : "text-white/80";
  const inner = (
    <>
      <p className={`text-[11px] font-bold ${labelColor} flex items-center justify-between gap-2`}>
        {label}
        {href && <ChevronRight className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 shrink-0" />}
      </p>
      <p className={`font-display mt-1 leading-none truncate ${compact ? "text-2xl md:text-3xl py-1" : "text-4xl md:text-5xl"}`}>{value}</p>
      {sub && <p className={`text-xs mt-2 font-medium ${subColor}`}>{sub}</p>}
    </>
  );
  if (!href) return <div className={`rounded-2xl p-5 ${bg}`}>{inner}</div>;
  return (
    <Link
      href={href}
      className={`group block rounded-2xl p-5 ${bg} transition-shadow hover:shadow-card-hover focus-neon`}
    >
      {inner}
    </Link>
  );
}
