"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Radio } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { trackTool } from "@/lib/analytics/tools";
import { fromLocal, type LocalTournament } from "@/lib/tournament/local";
import { newSecret, saveEntry } from "@/lib/tournament/store";
import { createTournament, errorText, tournamentsReady } from "./api";

/** Which tournament kept in this browser went live as which code, by when it was started (the offline tool's own id). */
const WENT_LIVE_KEY = "tapturf_tournament_went_live_v1";

function wentLive(startedAt: number): string | null {
  try {
    const o = JSON.parse(localStorage.getItem(WENT_LIVE_KEY) ?? "{}") as Record<string, unknown>;
    const c = o[String(startedAt)];
    return typeof c === "string" && /^[a-z0-9]{12}$/.test(c) ? c : null;
  } catch {
    return null;
  }
}
function noteLive(startedAt: number, code: string) {
  try {
    const o = JSON.parse(localStorage.getItem(WENT_LIVE_KEY) ?? "{}") as Record<string, unknown>;
    localStorage.setItem(WENT_LIVE_KEY, JSON.stringify({ ...o, [String(startedAt)]: code }));
  } catch {
    /* storage blocked: the live page is still made */
  }
}

/** Whether live tournaments can be made here; null while it is asked. */
function useReady(): boolean | null {
  const [ready, setReady] = useState<boolean | null>(null);
  useEffect(() => {
    let on = true;
    void tournamentsReady().then((r) => on && setReady(r));
    return () => {
      on = false;
    };
  }, []);
  return ready;
}

/**
 * "Go live: share a link" on the Cricket Tournament Manager: the
 * tournament kept in this browser becomes a live one (lib/tournament/
 * local.ts), its results and table carried over, with a page anyone with
 * the link can follow. The offline tournament stays as it is here. Shows
 * nothing until the server can take live tournaments.
 */
export function GoLive({ local, tool }: { local: LocalTournament; tool: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const ready = useReady();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setCode(wentLive(local.startedAt)), 0);
    return () => clearTimeout(t);
  }, [local.startedAt]);

  if (!ready) return null;
  if (code) {
    return (
      <Link href={`/tournament/${code}`} className="press-tight mt-5 flex items-center gap-3 rounded-2xl border-2 border-accent-500 bg-accent-50 px-4 py-3 hover:bg-accent-100">
        <Radio className="w-5 h-5 text-accent-700 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold text-primary-900">This tournament is live</span>
          <span className="block text-[13px] text-primary-600">Results you add here stay on this phone. Run it on the live page now.</span>
        </span>
        <ArrowRight className="w-5 h-5 text-accent-700 shrink-0" aria-hidden />
      </Link>
    );
  }

  const go = async () => {
    setError(null);
    const body = fromLocal(local);
    if ("error" in body) return setError(body.error === "teams" ? "Every team needs its own name to go live." : "This tournament has too many matches to go live.");
    const secret = newSecret();
    setBusy(true);
    const res = await createTournament({ secret, ...body.ok });
    setBusy(false);
    if (!("code" in res.body)) return setError(errorText(res.body.error, (res.body as { field?: string }).field));
    const made = res.body.code;
    saveEntry(made, { secret, name: body.ok.name, at: Date.now(), ...(res.body.kept && user ? { acct: user.id } : {}) });
    noteLive(local.startedAt, made);
    trackTool("tool_action", tool, { action: "go_live", matches: local.matches.length });
    router.push(`/tournament/${made}?new=1`);
  };

  return (
    <div className="mt-5 rounded-2xl bg-primary-900 text-white p-4">
      <p className="text-[12px] font-bold uppercase tracking-wide text-accent-300">Live tournament</p>
      <p className="mt-1 text-[16px] font-bold leading-snug">Share one link with your players</p>
      <p className="mt-1 text-[14px] text-white/75">The table, the fixtures and every match scored live, on a page anyone can follow. Your results come with it.</p>
      {error && (
        <p role="alert" className="mt-2 text-[13px] font-semibold text-red-300">
          {error}
        </p>
      )}
      <button type="button" onClick={() => void go()} disabled={busy} className="press-tight mt-3 w-full sm:w-auto inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full bg-accent-500 text-white text-[15px] font-bold hover:bg-accent-600 disabled:opacity-60">
        {busy ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden /> : <Radio className="w-4 h-4" aria-hidden />} Go live: share a link
      </button>
    </div>
  );
}

/** "Start a live tournament": to /tournament/new. Shows nothing until the server can take live tournaments. */
export function StartLiveCta({ tool, className = "" }: { tool: string; className?: string }) {
  const ready = useReady();
  if (!ready) return null;
  return (
    <Link
      href="/tournament/new"
      onClick={() => trackTool("tool_cta_clicked", tool, { href: "/tournament/new" })}
      className={`press-tight flex items-center gap-3 rounded-2xl border border-primary-200 bg-white px-4 py-3.5 hover:border-accent-400 transition-colors ${className}`}
    >
      <span className="grid place-items-center w-11 h-11 shrink-0 rounded-xl bg-accent-50 text-accent-700">
        <Radio className="w-5 h-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-primary-900">Start a live tournament</span>
        <span className="block text-[13px] text-primary-500">One link: table, fixtures, playoffs and live scores</span>
      </span>
      <ArrowRight className="w-5 h-5 text-primary-400 shrink-0" aria-hidden />
    </Link>
  );
}
