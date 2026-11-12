import { cityInfo } from "../city";
import { escapeHtml, oneLine } from "../email/format";
import { claimOwnerUrl } from "../my/claimFlow";
import { turfPath } from "../utils/turfPath";
import { REPORT_DAYS, timesText } from "./message";

/**
 * The owner's lead report (/report/<token>): what public.owner_report
 * answers (20261113_owner_outreach.sql), checked, and the page it becomes.
 * A small page of its own like /email/off (lib/email/offPage.ts): mobile
 * first, inline styles in the house colours, no scripts, no images, no
 * fonts fetched, nothing third-party, noindex. Counts only, shown as they
 * are, and worded as what was counted: the page was opened, a player tapped
 * Call or WhatsApp (never "called you", never a booking). Relative imports
 * only (npm run test:outreach).
 */

export type ReportCounts = { views: number; calls: number; whatsapp: number; ask: number };
export type ReportDay = { day: string; calls: number; whatsapp: number };
export type OwnerReport = {
  turf: { id: string; slug: string | null; name: string; area: string | null; city: string | null };
  claimed: boolean;
  days: number;
  since: string;
  today: string;
  now: ReportCounts;
  prev: ReportCounts;
  series: ReportDay[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1e9;
const text = (v: unknown, max: number) => (typeof v === "string" ? oneLine(v, max) || null : null);

function countsOf(raw: unknown): ReportCounts | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  return isCount(o.views) && isCount(o.calls) && isCount(o.whatsapp) && isCount(o.ask) ? { views: o.views, calls: o.calls, whatsapp: o.whatsapp, ask: o.ask } : null;
}

/** owner_report's {r: ok, ...} as a report; null for anything that isn't a whole one (never a guessed number). */
export function toReport(raw: unknown): OwnerReport | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.r !== "ok") return null;
  const t = (o.turf ?? {}) as Record<string, unknown>;
  const name = text(t.name, 120);
  if (typeof t.id !== "string" || !UUID.test(t.id) || !name) return null;
  const now = countsOf(o.now);
  const prev = countsOf(o.prev);
  if (!now || !prev || o.days !== REPORT_DAYS || typeof o.claimed !== "boolean") return null;
  if (typeof o.since !== "string" || !DAY.test(o.since) || typeof o.today !== "string" || !DAY.test(o.today)) return null;
  if (!Array.isArray(o.series) || o.series.length !== REPORT_DAYS) return null;
  const series: ReportDay[] = [];
  for (const s of o.series as Record<string, unknown>[]) {
    if (!s || typeof s.day !== "string" || !DAY.test(s.day) || !isCount(s.calls) || !isCount(s.whatsapp)) return null;
    series.push({ day: s.day, calls: s.calls, whatsapp: s.whatsapp });
  }
  // The bars are the totals, day by day: a report whose parts disagree is not shown.
  if (series.reduce((n, s) => n + s.calls, 0) !== now.calls || series.reduce((n, s) => n + s.whatsapp, 0) !== now.whatsapp) return null;
  const slug = typeof t.slug === "string" && /^[a-z0-9][a-z0-9-]{0,120}$/.test(t.slug) ? t.slug : null;
  const city = typeof t.city === "string" && /^[a-z][a-z0-9-]{1,40}$/.test(t.city.trim().toLowerCase()) ? t.city.trim().toLowerCase() : null;
  return { turf: { id: t.id.toLowerCase(), slug, name, area: text(t.area, 80), city }, claimed: o.claimed, days: REPORT_DAYS, since: o.since, today: o.today, now, prev, series };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-11-12" as "12 Nov" (the day as stored, India's; no clock involved). */
export function dayLabel(day: string): string {
  const [, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[m - 1] ?? ""}`.trim();
}

const num = (n: number) => n.toLocaleString("en-IN");

/** The line under a number: the 30 days before, as counted. */
export function beforeText(prev: number): string {
  return `${num(prev)} in the ${REPORT_DAYS} days before`;
}

/** The report's first sentence: taps when there are any, else page views, else plainly that it is quiet. */
export function headline(now: ReportCounts): string {
  const taps = now.calls + now.whatsapp;
  if (taps > 0) return `Players tapped Call or WhatsApp ${timesText(taps)} on your page in the last ${REPORT_DAYS} days.`;
  if (now.views > 0) return `Your page was opened ${timesText(now.views)} in the last ${REPORT_DAYS} days. Nobody tapped Call or WhatsApp on it yet.`;
  return `Your turf has a page on TapTurf. Nobody opened it in the last ${REPORT_DAYS} days.`;
}

/** The words of the page, kept here so the tests read them. */
export const REPORT_COPY = {
  label: "Free report for the turf's owner or manager",
  stats: { views: "Times your page was opened", calls: "Tapped Call", whatsapp: "Tapped WhatsApp", ask: "Shown in Ask TapTurf answers" },
  chartTitle: "Call and WhatsApp taps, day by day",
  noTaps: `No Call or WhatsApp taps in the last ${REPORT_DAYS} days.`,
  meaning: "A tap is a player pressing Call or WhatsApp on your page. We count the tap, not what happens after it. For bookings, players contact you directly.",
  claimTitle: "Claim your page — free",
  claimLead: "It takes a few minutes. Once you have claimed it, you can:",
  benefits: ["Update your prices, hours and photos", "Mark your free hours so players see them", "See these numbers any time on myTapturf"],
  claimButton: "Claim your page — free",
  claimedTitle: "This page is already claimed",
  claimedLead: "Its owner or manager can update it and see these numbers any time on myTapturf.",
  claimedButton: "Open myTapturf",
  seePage: "See your page on TapTurf",
  footer: "This report is counts from TapTurf's own pages only. It has no player's name or number. Questions? Write to info@tapturf.in.",
} as const;

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const BAR_PX = 88;

function chart(r: OwnerReport): string {
  const max = Math.max(...r.series.map((s) => s.calls + s.whatsapp));
  if (max === 0) return `<p class="quiet">${escapeHtml(REPORT_COPY.noTaps)}</p>`;
  const px = (n: number) => (n === 0 ? 0 : Math.max(3, Math.round((n / max) * BAR_PX)));
  const bars = r.series
    .map((s) => {
      const total = s.calls + s.whatsapp;
      const h = px(total);
      // One bar per day, WhatsApp over Call; its height is the day's taps against the busiest day's.
      const wa = total ? Math.round((s.whatsapp / total) * h) : 0;
      return `<span class="bar" title="${escapeHtml(`${dayLabel(s.day)}: ${s.calls} Call, ${s.whatsapp} WhatsApp`)}">${wa ? `<i class="wa" style="height:${wa}px"></i>` : ""}${h - wa ? `<i class="ca" style="height:${h - wa}px"></i>` : ""}</span>`;
    })
    .join("");
  const busiest = r.series.reduce((a, s) => (s.calls + s.whatsapp > a.calls + a.whatsapp ? s : a));
  const alt = `Bar chart of taps on each of the last ${REPORT_DAYS} days. Busiest day: ${dayLabel(busiest.day)}, ${timesText(busiest.calls + busiest.whatsapp).replace(/ times?$/, "")} ${busiest.calls + busiest.whatsapp === 1 ? "tap" : "taps"}.`;
  return `<div class="bars" role="img" aria-label="${escapeHtml(alt)}">${bars}</div>
<div class="axis"><span>${escapeHtml(dayLabel(r.since))}</span><span>Most in a day: ${num(max)}</span><span>${escapeHtml(dayLabel(r.today))}</span></div>
<div class="legend"><span><i class="ca"></i>Call</span><span><i class="wa"></i>WhatsApp</span></div>`;
}

const stat = (label: string, now: number, prev: number) =>
  `<div class="stat"><div class="n">${num(now)}</div><div class="l">${escapeHtml(label)}</div><div class="p">${escapeHtml(beforeText(prev))}</div></div>`;

const shell = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer"><meta name="color-scheme" content="light">
<title>${escapeHtml(title)}</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#F3F4F6;color:#1D1D1F;font-family:${FONT};-webkit-text-size-adjust:100%}
main{max-width:520px;margin:0 auto;padding:20px 16px 40px}
.brand{display:inline-block;font-size:20px;font-weight:800;letter-spacing:-0.3px;color:#15803D;text-decoration:none;margin:0 4px 12px}
.card{background:#fff;border:1px solid #E5E7EB;border-radius:16px;padding:20px 18px;margin-bottom:14px}
.label{margin:0 0 8px;font-size:12px;font-weight:700;color:#15803D}
h1{margin:0;font-size:24px;line-height:1.2;font-weight:800;letter-spacing:-0.4px;overflow-wrap:anywhere}
h2{margin:0 0 6px;font-size:18px;line-height:1.3;font-weight:700}
.sub{margin:6px 0 0;font-size:14px;line-height:1.45;color:#6E6E73}
.lead{margin:14px 0 0;font-size:17px;line-height:1.45;font-weight:600}
.stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}
.stat{background:#F9FAFB;border:1px solid #E5E7EB;border-radius:14px;padding:12px}
.n{font-size:28px;line-height:1.1;font-weight:800;letter-spacing:-0.5px;font-variant-numeric:tabular-nums}
.l{margin-top:4px;font-size:13px;line-height:1.3;font-weight:600}
.p{margin-top:4px;font-size:12px;line-height:1.3;color:#6E6E73}
.bars{display:flex;align-items:flex-end;gap:2px;height:${BAR_PX + 4}px;margin-top:12px;border-bottom:1px solid #E5E7EB}
.bar{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:flex-end}
.bar i{display:block;width:100%}
.bar i:first-child{border-radius:3px 3px 0 0}
.ca{background:#1D1D1F}
.wa{background:#16A34A}
.axis{display:flex;justify-content:space-between;gap:8px;margin-top:6px;font-size:12px;color:#6E6E73}
.legend{display:flex;gap:16px;margin-top:10px;font-size:13px;color:#3F3F46}
.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px}
.quiet,.note{margin:10px 0 0;font-size:14px;line-height:1.5;color:#6E6E73}
.text{margin:0;font-size:15px;line-height:1.5;color:#3F3F46}
ul{margin:12px 0 0;padding:0;list-style:none}
li{position:relative;margin:0 0 8px;padding-left:26px;font-size:15px;line-height:1.4}
li:before{content:"";position:absolute;left:4px;top:4px;width:6px;height:11px;border:solid #16A34A;border-width:0 2.5px 2.5px 0;transform:rotate(45deg)}
.btn{display:flex;align-items:center;justify-content:center;min-height:50px;margin-top:16px;padding:10px 18px;border-radius:999px;background:#16A34A;color:#fff;font-size:17px;font-weight:700;text-align:center;text-decoration:none}
.link{display:inline-block;margin-top:14px;padding:6px 0;font-size:15px;font-weight:600;color:#166534}
a:focus-visible{outline:3px solid #16A34A;outline-offset:2px}
footer{margin:16px 4px 0;font-size:13px;line-height:1.5;color:#6E6E73}
</style></head>
<body><main>
<a class="brand" href="/">TapTurf</a>
${body}
</main></body></html>`;

export type ReportState = { state: "ok"; report: OwnerReport } | { state: "bad" } | { state: "error" };

/** The page, and the status it answers with: 404 for a link we didn't sign (or a turf that is gone), 503 when the counts can't be read. */
export function reportPage(s: ReportState): { status: number; html: string } {
  if (s.state === "bad")
    return {
      status: 404,
      html: shell("Report not found | TapTurf", `<div class="card"><h1>This link doesn't work</h1><p class="sub">It may have been cut short when it was copied. Open the link from the message again, or write to info@tapturf.in.</p></div>`),
    };
  if (s.state === "error")
    return {
      status: 503,
      html: shell("Report | TapTurf", `<div class="card"><h1>Couldn't load the report just now</h1><p class="sub">Please try again in a minute.</p></div>`),
    };
  const r = s.report;
  const C = REPORT_COPY;
  const where = [r.turf.area, r.turf.city ? cityInfo(r.turf.city).label : null].filter(Boolean).join(", ");
  const range = `${dayLabel(r.since)} to ${dayLabel(r.today)}`;
  const cta = r.claimed
    ? `<div class="card"><h2>${escapeHtml(C.claimedTitle)}</h2><p class="text">${escapeHtml(C.claimedLead)}</p><a class="btn" href="/my">${escapeHtml(C.claimedButton)}</a></div>`
    : `<div class="card"><h2>${escapeHtml(C.claimTitle)}</h2><p class="text">${escapeHtml(C.claimLead)}</p><ul>${C.benefits.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul><a class="btn" href="${escapeHtml(claimOwnerUrl(r.turf.id))}">${escapeHtml(C.claimButton)}</a></div>`;
  const body = `<div class="card">
<p class="label">${escapeHtml(C.label)}</p>
<h1>${escapeHtml(r.turf.name)} on TapTurf</h1>
<p class="sub">${escapeHtml([where, `Last ${REPORT_DAYS} days, ${range}`].filter(Boolean).join(" · "))}</p>
<p class="lead">${escapeHtml(headline(r.now))}</p>
<div class="stats">
${stat(C.stats.views, r.now.views, r.prev.views)}
${stat(C.stats.calls, r.now.calls, r.prev.calls)}
${stat(C.stats.whatsapp, r.now.whatsapp, r.prev.whatsapp)}
${stat(C.stats.ask, r.now.ask, r.prev.ask)}
</div>
</div>
<div class="card">
<h2>${escapeHtml(C.chartTitle)}</h2>
${chart(r)}
<p class="note">${escapeHtml(C.meaning)}</p>
</div>
${cta}
<a class="link" href="${escapeHtml(turfPath(r.turf))}">${escapeHtml(C.seePage)}</a>
<footer>${escapeHtml(C.footer)}</footer>`;
  return { status: 200, html: shell(`${r.turf.name}: your TapTurf report`, body) };
}
