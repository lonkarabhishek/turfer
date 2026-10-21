import { isTag, type Tag } from "../account/tag";

/**
 * TapTurf profile tags on a live match or board, checked on the server
 * before a match is stored and again before it is served: a tag of
 * someone who turned "Let others find and tag me" off is removed, and an
 * old username becomes the current one. Pure, relative imports only
 * (npm run test:live); the lookup is passed in.
 *
 * Tags are { u } under a "tag" key (a player, a pick, a rename) or
 * under "tags" by side (a board's singles players). Nothing else in a
 * match uses those keys.
 */

/** live_tags_check takes at most this many names; past it every tag is removed. */
export const LIVE_TAGS_MAX = 64;

/** Events whose tag key means something when present (null clears): never left out, set to null instead. */
const KEEP_KEY = new Set(["rename", "tagPlayer"]);

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

function walk(x: unknown, visit: (owner: Record<string, unknown>, key: "tag" | "tags") => void): void {
  if (Array.isArray(x)) {
    for (const v of x) walk(v, visit);
    return;
  }
  if (!isObj(x)) return;
  for (const k of Object.keys(x)) {
    if (k === "tag") visit(x, "tag");
    else if (k === "tags" && isObj(x.tags)) visit(x, "tags");
    else walk(x[k], visit);
  }
}

/** Every distinct username tagged in a match or board. */
export function liveTagNames(match: unknown): string[] {
  const out = new Set<string>();
  walk(match, (owner, key) => {
    if (key === "tag") {
      if (isTag(owner.tag)) out.add(owner.tag.u);
    } else {
      for (const t of Object.values(owner.tags as Record<string, unknown>)) if (isTag(t)) out.add(t.u);
    }
  });
  return [...out];
}

/**
 * A copy of the match with each tag set to the current username in
 * `current` (asked -> current), or removed when it is not there.
 */
export function withTags<T>(match: T, current: ReadonlyMap<string, string>): T {
  const copy = structuredClone(match);
  const now = (t: unknown): Tag | null => (isTag(t) && current.has(t.u) ? { u: current.get(t.u)! } : null);
  walk(copy, (owner, key) => {
    if (key === "tag") {
      if (owner.tag === null) return;
      const t = now(owner.tag);
      if (t) owner.tag = t;
      else if (typeof owner.type === "string" && KEEP_KEY.has(owner.type)) owner.tag = null;
      else delete owner.tag;
    } else {
      const tags = owner.tags as Record<string, unknown>;
      for (const side of Object.keys(tags)) {
        const t = now(tags[side]);
        if (t) tags[side] = t;
        else delete tags[side];
      }
      if (Object.keys(tags).length === 0) delete owner.tags;
    }
  });
  return copy;
}

/** asked -> current, from live_tags_check. Null when it could not be checked. */
export type TagLookup = (names: string[]) => Promise<Map<string, string> | null>;

/**
 * A lookup with a short per-instance memory, so a busy link checks its
 * tags about twice a minute, not on every write. Someone who turns
 * tagging off disappears from new loads within about a minute.
 */
export function createTagLookup(
  fetchTags: (names: string[]) => Promise<{ asked: string; u: string }[] | null>,
  { ttlMs = 30_000, max = 5_000, now = Date.now }: { ttlMs?: number; max?: number; now?: () => number } = {},
): TagLookup {
  const memo = new Map<string, { at: number; u: string | null }>();
  return async (names) => {
    const t = now();
    const out = new Map<string, string>();
    const ask: string[] = [];
    for (const n of names) {
      const hit = memo.get(n);
      if (hit && t - hit.at < ttlMs) {
        if (hit.u) out.set(n, hit.u);
      } else ask.push(n);
    }
    if (ask.length) {
      let rows: { asked: string; u: string }[] | null;
      try {
        rows = await fetchTags(ask);
      } catch {
        rows = null;
      }
      if (!rows) return null;
      const found = new Map(rows.map((r) => [r.asked, r.u]));
      if (memo.size + ask.length > max) memo.clear();
      for (const n of ask) {
        const u = found.get(n) ?? null;
        memo.set(n, { at: t, u });
        if (u) out.set(n, u);
      }
    }
    return out;
  };
}

/**
 * The match with its tags checked. Never throws: when the check fails,
 * or there are more names than it takes, every tag is removed and the
 * match still goes through; the next write or read puts them back.
 */
export async function checkLiveTags<T>(match: T, lookup: TagLookup): Promise<T> {
  const names = liveTagNames(match);
  if (names.length === 0) return match;
  if (names.length > LIVE_TAGS_MAX) return withTags(match, new Map());
  let current: Map<string, string> | null;
  try {
    current = await lookup(names);
  } catch {
    current = null;
  }
  return withTags(match, current ?? new Map());
}
