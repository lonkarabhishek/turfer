import { COUNTED_TOOLS, type CountedTool } from "./usage";

/**
 * Who used the free tools and what they used, for the admin's Tool users
 * page (app/admin/tools): the rows admin_tool_users and
 * admin_tool_activity return (supabase/migrations/20261027_tool_users.sql)
 * turned into one entry per person, with the tools as chips, and the
 * page's filters. Pure (the page shows times with lib/admin/people.ts
 * istDateTime). Relative imports only (npm run test:toss).
 */

/** One person and tool, as admin_tool_users returns it. */
export type ToolUserRow = {
  user_id: string | null;
  device: string | null;
  name: string | null;
  username: string | null;
  tool: string;
  started: number;
  finished: number;
  first_at: string;
  last_at: string;
  city: string | null;
  details: string[] | null;
  codes: string[] | null;
};

/** One use, as admin_tool_activity returns it. */
export type ToolActivityRow = {
  used_at: string;
  tool: string;
  event: string;
  detail: string;
  code: string | null;
  user_id: string | null;
  device: string | null;
  city: string | null;
  name: string | null;
  username: string | null;
};

/** The chip names. */
export const TOOL_LABELS: Record<CountedTool, string> = {
  toss: "Toss",
  live_scoreboard: "Live scoreboard",
  live_scorer: "Live cricket scorer",
  scorecard_maker: "Scorecard maker",
  tournament_scorer: "Tournament scorer",
  team_generator: "Team generator",
  nrr_calculator: "NRR calculator",
};

export const toolLabel = (tool: string): string => (TOOL_LABELS as Record<string, string>)[tool] ?? tool.replace(/_/g, " ");

export type ToolChip = {
  tool: string;
  label: string;
  /** Uses: the starts, or the finishes when none started here (a match started before the log). */
  n: number;
  finished: number;
  /** The latest distinct tags, as shown ("Football", "6 overs · 11-a-side"). */
  details: string[];
  /** The latest live link codes. */
  codes: string[];
  last: number;
};

export type ToolPerson = {
  /** u:<account> or d:<device tag>; "-" for guests whose browser keeps no tag. */
  key: string;
  userId: string | null;
  device: string | null;
  name: string | null;
  username: string | null;
  city: string | null;
  first: number;
  last: number;
  uses: number;
  tools: ToolChip[];
};

const time = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};

const FORMAT_NAMES: Record<string, string> = { tri: "Tri-series", bilateral: "Bilateral series", roundrobin: "Round robin" };

/** One tag as shown: "6-overs" is "6 overs", "box-cricket" is "Box cricket", a format by its name. */
export function tagText(tag: string): string {
  const count = /^(\d+)-(overs|players|teams|matches)$/.exec(tag);
  if (count) return `${count[1]} ${count[2]}`;
  if (/^\d+-a-side$/.test(tag)) return tag;
  if (FORMAT_NAMES[tag]) return FORMAT_NAMES[tag];
  const words = tag.replace(/[-_]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : tag;
}

/** A use's tags as one line ("Football", "6 overs · 11-a-side"), or "". */
export const detailText = (detail: string | null | undefined): string => (detail ? detail.split(" ").filter(Boolean).map(tagText).join(" · ") : "");

/** The person a row is for. */
export const personKey = (r: { user_id: string | null; device: string | null }): string => (r.user_id ? `u:${r.user_id}` : r.device ? `d:${r.device}` : "-");

/** The rows as one entry per person, last used first; each person's tools by uses, then name. */
export function toolPeople(rows: readonly ToolUserRow[]): ToolPerson[] {
  const by = new Map<string, ToolPerson>();
  /** When each person's city was seen: the latest one wins. */
  const cityAt = new Map<string, number>();
  for (const r of rows) {
    if (!r || typeof r.tool !== "string") continue;
    const key = personKey(r);
    const first = time(r.first_at);
    const last = time(r.last_at);
    const started = Number(r.started) || 0;
    const finished = Number(r.finished) || 0;
    let p = by.get(key);
    if (!p) {
      p = { key, userId: r.user_id, device: r.user_id ? null : r.device, name: r.name, username: r.username, city: null, first, last, uses: 0, tools: [] };
      by.set(key, p);
    }
    p.first = Math.min(p.first, first);
    p.last = Math.max(p.last, last);
    if (r.city && last > (cityAt.get(key) ?? -1)) {
      p.city = r.city;
      cityAt.set(key, last);
    }
    const n = started || finished;
    p.uses += n;
    p.tools.push({
      tool: r.tool,
      label: toolLabel(r.tool),
      n,
      finished,
      details: (r.details ?? []).map(detailText).filter(Boolean),
      codes: (r.codes ?? []).filter((c) => /^[a-z0-9]{12}$/.test(c)),
      last,
    });
  }
  return [...by.values()]
    .map((p) => ({ ...p, tools: p.tools.sort((a, b) => b.n - a.n || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0)) }))
    .sort((a, b) => b.last - a.last || (a.key < b.key ? -1 : 1));
}

export type WhoFilter = "all" | "signed" | "guest";
export const WHO_FILTERS: Record<WhoFilter, string> = { all: "Everyone", signed: "Signed in", guest: "Guests" };

/** A ?who= value, or "all". */
export const whoFilter = (x: unknown): WhoFilter => (x === "signed" || x === "guest" ? x : "all");

/** A ?tool= value, or null for every tool. */
export const toolFilter = (x: unknown): CountedTool | null => COUNTED_TOOLS.find((t) => t === x) ?? null;

/** The people who used the tool (it leads their chips), signed in or guests only. */
export function filterPeople(people: readonly ToolPerson[], tool: CountedTool | null, who: WhoFilter): ToolPerson[] {
  return people
    .filter((p) => (who === "signed" ? p.userId !== null : who === "guest" ? p.userId === null : true))
    .filter((p) => !tool || p.tools.some((c) => c.tool === tool))
    .map((p) => (tool ? { ...p, tools: [...p.tools.filter((c) => c.tool === tool), ...p.tools.filter((c) => c.tool !== tool)] } : p));
}

/** How many people used each tool, for the tool filter. */
export function peoplePerTool(people: readonly ToolPerson[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of people) for (const c of p.tools) out[c.tool] = (out[c.tool] ?? 0) + 1;
  return out;
}

/** "Toss ×3", "Live scoreboard ×1 · Football". */
export function chipText(c: ToolChip): string {
  return `${c.label} ×${c.n}${c.details.length ? ` · ${c.details.join(", ")}` : ""}`;
}

/** The short form of a device tag shown for a guest. */
export const shortDevice = (device: string | null): string => (device ? device.slice(0, 6) : "");

/** Who a person is, in a line: their name, else "Guest". */
export const whoName = (p: { userId: string | null; name: string | null }): string => (p.userId ? p.name?.trim() || "No name" : "Guest");

/** What a use was, in a line: "Started · Football", "Finished · 6 overs · 11-a-side". */
export function activityWhat(r: Pick<ToolActivityRow, "event" | "detail">): string {
  const what = detailText(r.detail);
  return `${r.event === "finished" ? "Finished" : "Started"}${what ? ` · ${what}` : ""}`;
}
