"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Plus, Trophy } from "lucide-react";
import { loadStore } from "@/lib/tournament/store";
import type { MineItem } from "@/lib/tournament/types";
import { myTournaments } from "./api";

const FORMAT: Record<MineItem["format"], string> = { league: "League", bilateral: "Series", tri: "Tri-series" };

type Row = { code: string; name: string; sub: string; here: boolean };

/**
 * "My tournaments" on the Me tab: the live tournaments kept with this
 * account (GET /api/tournament/mine), and any this phone runs that are not
 * kept with it yet. Each opens its page; on a phone that does not hold a
 * tournament's key it asks to manage it from here (?manage=1). Nothing
 * shows when there are none (or before the database has tournaments).
 */
export function MyTournaments({ className = "" }: { className?: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    let on = true;
    void myTournaments().then((list) => {
      if (!on) return;
      const here = loadStore().list;
      const out: Row[] = (list ?? []).map((t) => ({
        code: t.code,
        name: t.name,
        sub: `${FORMAT[t.format]} · ${t.teams} teams · ${t.played} of ${t.fixtures} played`,
        here: !!here[t.code],
      }));
      for (const [code, e] of Object.entries(here).sort((a, b) => b[1].at - a[1].at)) {
        if (!out.some((r) => r.code === code)) out.push({ code, name: e.name || "Tournament", sub: "Run from this phone", here: true });
      }
      setRows(out.slice(0, 12));
    });
    return () => {
      on = false;
    };
  }, []);

  if (!rows || rows.length === 0) return null;
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
            <Link href={`/tournament/${r.code}${r.here ? "" : "?manage=1"}`} className="flex items-center gap-3 px-4 py-3 min-h-[60px] hover:bg-primary-50 focus-neon">
              <span className="grid place-items-center w-10 h-10 shrink-0 rounded-xl bg-accent-50 border border-accent-500/30">
                <Trophy className="w-5 h-5 text-accent-600" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-primary-900 truncate">{r.name}</span>
                <span className="block text-[13px] text-primary-500 truncate">{r.sub}</span>
              </span>
              <ChevronRight className="w-5 h-5 text-primary-400 shrink-0" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
