import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { ADMIN_TOKEN_COOKIE } from "@/lib/admin/auth";

export type AskRow = {
  id: number;
  ip_hash: string;
  query: string;
  reply: string | null;
  intent: string | null;
  filters: Record<string, unknown> | null;
  results: number | null;
  ms: number | null;
  source: "claude" | "keywords" | null;
  created_at: string;
  user_id: string | null;
  user_name: string | null;
};

/** Rows from one visitor within 30 minutes of each other, oldest first. */
export type AskThread = { key: string; ip_hash: string; started: string; ended: string; rows: AskRow[] };

export type AsksResult = { ok: true; rows: AskRow[] } | { ok: false; reason: "not_allowed" | "not_set_up" | "error" };

export const ASK_FILTERS = {
  all: "Last 7 days",
  today: "Today",
  month: "30 days",
  empty: "No results",
  offtopic: "Off topic",
} as const;
export type AskFilter = keyof typeof ASK_FILTERS;

/** Owner-only transcript of Ask TapTurf conversations. */
export async function getAskTranscripts(days = 7): Promise<AsksResult> {
  try {
    const supabase = await createServerClient();
    const token = (await cookies()).get(ADMIN_TOKEN_COOKIE)?.value ?? null;
    const { data, error } = await supabase.rpc("get_ask_transcripts_v2", { p_days: days, p_limit: 1000, p_firebase_token: token });
    if (error) {
      if (error.code === "42501") return { ok: false, reason: "not_allowed" };
      if (error.code === "PGRST202" || error.code === "42883") return { ok: false, reason: "not_set_up" };
      return { ok: false, reason: "error" };
    }
    return { ok: true, rows: (data ?? []) as AskRow[] };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export function filterAsks(rows: AskRow[], f: AskFilter): AskRow[] {
  const now = Date.now();
  switch (f) {
    case "today": {
      // Today in India.
      const ist = new Date(now + 330 * 60_000);
      const start = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 330 * 60_000;
      return rows.filter((r) => new Date(r.created_at).getTime() >= start);
    }
    case "empty":
      return rows.filter((r) => r.results === 0 && r.intent !== "other");
    case "offtopic":
      return rows.filter((r) => r.intent === "other");
    default:
      return rows;
  }
}

const GAP_MS = 30 * 60_000;

/** Group rows (newest first in) into threads, newest thread first, rows oldest first inside. */
export function threadAsks(rows: AskRow[]): AskThread[] {
  const asc = [...rows].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const open = new Map<string, AskThread>();
  const out: AskThread[] = [];
  for (const r of asc) {
    const t = new Date(r.created_at).getTime();
    const who = r.user_id ?? r.ip_hash;
    const cur = open.get(who);
    if (cur && t - new Date(cur.ended).getTime() <= GAP_MS) {
      cur.rows.push(r);
      cur.ended = r.created_at;
    } else {
      const th: AskThread = { key: `${who}-${r.id}`, ip_hash: r.ip_hash, started: r.created_at, ended: r.created_at, rows: [r] };
      open.set(who, th);
      out.push(th);
    }
  }
  return out.sort((a, b) => new Date(b.ended).getTime() - new Date(a.ended).getTime());
}

export function askStats(rows: AskRow[]) {
  const claude = rows.filter((r) => r.source === "claude").length;
  const empty = rows.filter((r) => r.results === 0 && r.intent !== "other").length;
  const visitors = new Set(rows.map((r) => r.user_id ?? r.ip_hash)).size;
  const ms = rows.map((r) => r.ms).filter((x): x is number => x != null).sort((a, b) => a - b);
  const p50 = ms.length ? ms[Math.floor(ms.length / 2)] : null;
  const byIntent = rows.reduce<Record<string, number>>((m, r) => ((m[r.intent ?? "?"] = (m[r.intent ?? "?"] ?? 0) + 1), m), {});
  return { total: rows.length, claude, empty, visitors, p50, byIntent };
}
