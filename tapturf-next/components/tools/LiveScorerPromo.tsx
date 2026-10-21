import Link from "next/link";
import { Activity, ArrowRight, Tally5 } from "lucide-react";
import { readBoardSport, SPORT_LIST } from "@/lib/board/sports";
import { toolPath } from "@/lib/tools/registry";

/**
 * A reminder to score the game live, shown once the game is created and on
 * its game page. Cricket opens the Live Cricket Scorer; a sport the Live
 * Scoreboard knows opens that with the sport picked; anything else (swimming)
 * shows nothing. Plain markup with no state, so it renders inside either
 * client screen; each tool reads ?sport, ?name, ?venue and ?from=game itself
 * (prefill and the "from game" tool_opened event).
 */
export function LiveScorerPromo({ sport, venue, variant, live = false, liveLinks = true }: { sport: string; venue?: string; variant: "created" | "game"; live?: boolean; liveLinks?: boolean }) {
  const cricket = /cricket/i.test(sport);
  const board = cricket ? null : readBoardSport(sport);
  if (!cricket && !board) return null;

  // "Other" keeps the game's own label (Ultimate Frisbee), so the scoreboard is named for it too.
  const label = board === "other" ? sport.trim() : (SPORT_LIST.find((s) => s.sport === board)?.label ?? sport.trim());
  const word = label.toLowerCase();
  const place = venue?.trim();
  const query = [
    board && `sport=${board}`,
    board === "other" && `name=${encodeURIComponent(label)}`,
    place && `venue=${encodeURIComponent(place)}`,
    "from=game",
  ]
    .filter(Boolean)
    .join("&");
  const href = `${toolPath(board ? "live-scoreboard" : "cricket-live-scorer")}?${query}`;
  const by = board === "football" ? "goal by goal" : "point by point";

  // On the game page during the slot, this is the thing to do next, so it
  // gets the tinted card and the solid button. Otherwise it stays quiet and
  // never competes with sharing the game.
  const now = variant === "game" && live;
  const Heading = variant === "game" ? "h3" : "h2";
  const Icon = board ? Tally5 : Activity;

  const heading = board ? `${now ? "Game on? " : ""}Score your ${word} game live` : now ? "Game on? Score it live" : "Score it live on match day";
  const body = board
    ? liveLinks
      ? `Score ${by} on your phone and share one link. Everyone sees the score, and a quick login keeps it live. No app needed.`
      : `Score ${by} on your phone. The scoreboard keeps itself up to date, ready to share on WhatsApp.`
    : liveLinks
      ? "Score ball by ball on your phone and share one link. Everyone sees the score, and a quick login keeps it live. No app needed."
      : "Score ball by ball on your phone. The scorecard, run rates and graphs keep themselves up to date.";

  return (
    <div
      className={`rounded-2xl border p-5 text-left ${variant === "created" ? "w-full mt-8" : "mb-5"} ${
        now ? "bg-accent-50 border-accent-500/30" : "bg-white border-primary-200"
      }`}
    >
      <div className="flex items-start gap-3.5">
        <span className={`shrink-0 w-11 h-11 rounded-xl inline-flex items-center justify-center text-accent-700 ${now ? "bg-white" : "bg-accent-50"}`}>
          <Icon className="w-5 h-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <Heading className="text-base font-semibold text-primary-800">{heading}</Heading>
          <p className="mt-1 text-sm text-primary-500 leading-relaxed">{body}</p>
        </div>
      </div>
      <Link
        href={href}
        className={`press-tight mt-4 inline-flex w-full sm:w-auto items-center justify-center gap-2 min-h-[48px] px-6 rounded-full text-[15px] font-semibold transition-colors focus-neon ${
          now ? "bg-primary-900 text-white hover:bg-accent-600" : "border-2 border-primary-200 bg-white text-primary-800 hover:border-accent-400"
        }`}
      >
        {board ? "Open the Live Scoreboard" : "Open the Live Scorer"}
        <ArrowRight className="w-4 h-4" aria-hidden />
      </Link>
    </div>
  );
}
