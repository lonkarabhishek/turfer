import Link from "next/link";
import { ChevronRight, Plus, Trophy } from "lucide-react";
import type { TournamentRow } from "@/lib/matches/tournaments";

/**
 * "My tournaments" on the Me tab's Matches: the live tournaments kept
 * with this account, and any this phone runs that are not kept with it yet
 * (the rows are lib/matches/tournaments.ts, read by
 * components/dashboard/useMatches.ts). Each opens its page; on a phone
 * that does not hold a tournament's key it asks to manage it from here
 * (?manage=1). Nothing shows when there are none (or before the database
 * has tournaments).
 */
export function MyTournaments({ rows, className = "" }: { rows: readonly TournamentRow[]; className?: string }) {
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="my-tournaments" className={className}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <h2 id="my-tournaments" className="text-[17px] font-bold text-primary-900">
          My tournaments
        </h2>
        <Link href="/tournament/new" className="inline-flex items-center gap-1 min-h-[44px] text-[14px] font-semibold text-accent-700">
          <Plus className="w-4 h-4" aria-hidden /> New
        </Link>
      </div>
      <ul className="rounded-2xl border border-primary-200 bg-white divide-y divide-primary-100 overflow-hidden">
        {rows.map((r) => (
          <li key={r.code}>
            <Link href={r.href} className="flex items-center gap-3 px-4 py-3 min-h-[60px] hover:bg-primary-50 focus-neon">
              <span className="grid place-items-center w-10 h-10 shrink-0 rounded-xl bg-accent-50 border border-accent-500/30">
                <Trophy className="w-5 h-5 text-accent-600" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-primary-900 truncate">{r.name}</span>
                <span className="block text-[13px] leading-snug text-primary-500">{r.sub}</span>
              </span>
              <ChevronRight className="w-5 h-5 text-primary-400 shrink-0" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
