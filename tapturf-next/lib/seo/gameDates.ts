/**
 * SportsEvent startDate and endDate in India time. games.date and the
 * times are IST wall-clock values; without an offset Google reads
 * "2026-11-02T19:00:00" in its own zone. A game that ends at or before
 * its start time ends the next day (8 PM to 1 AM).
 *
 * Pure, so node --test runs it.
 */
const IST = "+05:30";

function hms(t: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(t ?? "").trim());
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}:${m[3] ?? "00"}`;
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function gameDates(g: { date: string; start_time: string | null; end_time: string | null }): { startDate: string; endDate?: string } {
  const start = hms(g.start_time);
  const end = hms(g.end_time);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(g.date) || !start) return { startDate: g.date };
  const out: { startDate: string; endDate?: string } = { startDate: `${g.date}T${start}${IST}` };
  if (end) out.endDate = `${end <= start ? nextDay(g.date) : g.date}T${end}${IST}`;
  return out;
}
