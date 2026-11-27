"use client";

import { useMemo } from "react";
import { AskAboutButton } from "@/components/ask/AskAboutButton";
import { AskPageContext } from "@/components/ask/AskPageContext";
import { tournamentHasOf } from "@/lib/ask/tournamentHas";
import { tournamentAskChips } from "@/lib/ask/tournamentKind";
import type { Resolution } from "@/lib/tournament/standings";
import type { Format } from "@/lib/tournament/types";

/**
 * Ask TapTurf on a tournament's page: tells the chat which tournament is
 * on screen (so a question is answered from its table and scorecards,
 * lib/ask/tournament.ts) with chips for what this tournament actually has,
 * and draws the in-page way in, the turf page's "Ask about this turf"
 * button with this page's words. Asking takes a sign-in here, as on a
 * live score page; the chat says so when it opens.
 */
export function TournamentAsk({ code, res, format }: { code: string; res: Resolution; format: Format }) {
  const has = useMemo(() => tournamentHasOf(res, format), [res, format]);
  const chips = useMemo(() => tournamentAskChips(has), [has]);
  return (
    <section aria-label="Ask about this tournament" className="mt-8 rounded-2xl border border-primary-200 bg-white p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3">
      <AskPageContext tournament={{ code, chips }} />
      <p className="min-w-0 flex-1 text-[14px] leading-snug text-primary-600">
        <span className="block text-[15px] font-bold text-primary-900">Got a question about this tournament?</span>
        {has.scored > 0 ? "Who's ahead, any result, the top scorer or one player's numbers: answered from this page's table and scorecards." : "Who's ahead, any result or the next match: answered from this page's table and results."}
      </p>
      <span className="shrink-0">
        <AskAboutButton label="Ask about this tournament" wide />
      </span>
    </section>
  );
}
