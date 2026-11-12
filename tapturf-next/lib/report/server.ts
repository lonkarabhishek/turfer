import { accountKey, accountRpcIfThere } from "../account/server";
import { reportPage, toReport, toSaid, type ReportState } from "./report";
import { readReportToken, reportKey } from "./token";

/**
 * GET /report/<token>: the owner's lead report, no sign-in. The token is
 * the turf's id signed by the app (lib/report/token.ts); the counts come
 * from public.owner_report with the server key (20261113_owner_outreach.sql),
 * read each time, and what players told us from public.owner_report_said
 * (20261113_contact_outcomes.sql; before that file, or when that read
 * fails, the report is shown without it). Never cached by anyone but the browser's own back button
 * (private, no-store), never indexed (X-Robots-Tag, and the page's own
 * meta), and the page has no script at all. Relative imports only
 * (npm run test:outreach).
 */

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: Record<string, unknown> } | { missing: true } | { unavailable: true }>;

export const REPORT_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

export async function reportState(token: unknown, deps: { accountKey?: string | null; rpc?: Rpc } = {}): Promise<ReportState> {
  const ak = deps.accountKey === undefined ? accountKey() : deps.accountKey;
  if (!ak) return { state: "error" };
  const named = readReportToken(reportKey(ak), token);
  if (!named) return { state: "bad" };
  const rpc = deps.rpc ?? (accountRpcIfThere as Rpc);
  const [res, said] = await Promise.all([rpc("owner_report", { p_turf_id: named.turfId }), rpc("owner_report_said", { p_turf_id: named.turfId }).catch(() => ({ unavailable: true as const }))]);
  if (!("data" in res)) return { state: "error" };
  if (res.data?.r === "not_found") return { state: "bad" };
  const report = toReport(res.data);
  // The link names one turf: an answer about another is never shown.
  return report && report.turf.id === named.turfId ? { state: "ok", report, said: "data" in said ? toSaid(said.data) : null } : { state: "error" };
}

export async function getReport(token: unknown, deps?: Parameters<typeof reportState>[1]): Promise<Response> {
  const page = reportPage(await reportState(token, deps));
  return new Response(page.html, { status: page.status, headers: page.status === 503 ? { ...REPORT_HEADERS, "Retry-After": "60" } : REPORT_HEADERS });
}
