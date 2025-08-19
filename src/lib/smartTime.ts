export type SmartQuery = {
  dateHint: "today" | "tomorrow" | "weekend" | "weekday" | "custom";
  startHour24?: number; // 0-23
  players?: number;
  area?: string | null;
};

export function parseSmartQuery(input: string): SmartQuery {
  const s = input.toLowerCase();
  const q: SmartQuery = { dateHint: "custom", area: null };

  if (/\btomorrow\b/.test(s)) q.dateHint = "tomorrow";
  else if (/\btonight\b/.test(s)) { q.dateHint = "today"; q.startHour24 = Math.max(19, q.startHour24 ?? 19); }
  else if (/\bweekend\b/.test(s)) q.dateHint = "weekend";
  else if (/\btoday\b/.test(s)) q.dateHint = "today";

  const to24 = (h: number, ap?: string) => {
    if (!ap) return h;
    const isPM = ap.toLowerCase().startsWith("p");
    if (h === 12) return isPM ? 12 : 0;
    return isPM ? h + 12 : h;
  };

  const mAfter = s.match(/after\s+(\d{1,2})\s*(am|pm)?/);
  const mAt    = s.match(/\b(at|from)\s+(\d{1,2})\s*(am|pm)?/);
  const mRange = s.match(/(\d{1,2})\s*[-–to]+\s*(\d{1,2})\s*(am|pm)?/);

  if (mRange) q.startHour24 = to24(parseInt(mRange[1]), mRange[3] as any);
  else if (mAfter) q.startHour24 = to24(parseInt(mAfter[1]), mAfter[2] as any);
  else if (mAt)    q.startHour24 = to24(parseInt(mAt[2]), mAt[3] as any);

  const p = s.match(/(\d{1,2})\s*(players|people|pax)/);
  if (p) q.players = parseInt(p[1]);

  const a = s.match(/near\s+([a-z0-9\s]+)/);
  if (a) q.area = a[1].trim();

  return q;
}
