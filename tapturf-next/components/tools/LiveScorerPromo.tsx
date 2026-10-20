import Link from "next/link";
import { Activity, ArrowRight } from "lucide-react";
import { toolPath } from "@/lib/tools/registry";

/**
 * A reminder to score a cricket game with the Live Scorer, shown once the
 * game is created and on its game page. Plain markup with no state, so it
 * renders inside either client screen; the scorer reads ?venue and
 * ?from=game itself (prefill and the "from game" tool_opened event).
 */
export function LiveScorerPromo({ venue, variant, live = false, liveLinks = true }: { venue?: string; variant: "created" | "game"; live?: boolean; liveLinks?: boolean }) {
  const place = venue?.trim();
  const href = `${toolPath("cricket-live-scorer")}?${place ? `venue=${encodeURIComponent(place)}&` : ""}from=game`;
  // On the game page during the slot, this is the thing to do next, so it
  // gets the tinted card and the solid button. Otherwise it stays quiet and
  // never competes with sharing the game.
  const now = variant === "game" && live;
  const Heading = variant === "game" ? "h3" : "h2";

  return (
    <div
      className={`rounded-2xl border p-5 text-left ${variant === "created" ? "w-full mt-8" : "mb-5"} ${
        now ? "bg-accent-50 border-accent-500/30" : "bg-white border-primary-200"
      }`}
    >
      <div className="flex items-start gap-3.5">
        <span className={`shrink-0 w-11 h-11 rounded-xl inline-flex items-center justify-center text-accent-700 ${now ? "bg-white" : "bg-accent-50"}`}>
          <Activity className="w-5 h-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <Heading className="text-base font-semibold text-primary-800">{now ? "Game on? Score it live" : "Score it live on match day"}</Heading>
          <p className="mt-1 text-sm text-primary-500 leading-relaxed">
            {liveLinks
              ? "Score ball by ball on your phone and share one link. Everyone can follow the score live, no app needed."
              : "Score ball by ball on your phone. The scorecard, run rates and graphs keep themselves up to date."}
          </p>
        </div>
      </div>
      <Link
        href={href}
        className={`press-tight mt-4 inline-flex w-full sm:w-auto items-center justify-center gap-2 min-h-[48px] px-6 rounded-full text-[15px] font-semibold transition-colors focus-neon ${
          now ? "bg-primary-900 text-white hover:bg-accent-600" : "border-2 border-primary-200 bg-white text-primary-800 hover:border-accent-400"
        }`}
      >
        Open the Live Scorer
        <ArrowRight className="w-4 h-4" aria-hidden />
      </Link>
    </div>
  );
}
