/**
 * A game host's public profile username (/u/<username>), for the game's
 * JSON-LD organizer url (lib/seo/gameJsonLd.ts), found on the server.
 *
 * No database function gives a username for an account id (usernames are
 * read only through functions, 20261021_accounts_usernames.sql), and this
 * needs no new one: it asks players_search (the tagging search, behind
 * ACCOUNT_KEY) for the host's name as the game stores it (games.host_name
 * is users.name when the game was made), and keeps a username only when
 * profile_owner says that username belongs to the game's creator. Both
 * answer only for a username whose profile is shown ("Let others find and
 * tag me" on), so a host who turned that off, has no username, renamed
 * since, or shares a name with more than 8 people found first, gets no
 * profile link: the organizer url is then the game's page. Never wrong,
 * sometimes absent.
 *
 * Remembered per process for TTL_MS (a name change or the switch shows
 * within that, plus the page's minute), at most MAX_HOSTS hosts asked per
 * call, and a page waits at most BUDGET_MS for answers it does not have
 * yet (a slow database must not hold a render; a late answer is kept for
 * the next one). A failed lookup is not remembered.
 *
 * Pure: the database comes in as `deps` (lib/games/hostProfile.server.ts),
 * so node --test runs it (npm run test:games).
 */

export type HostRef = { id: string | null | undefined; name: string | null | undefined };

/** A players_search hit: a shown username and the account's name. */
export type PlayerHit = { u: string; name: string };

export type HostLookupDeps = {
  /** players_search: up to 8 hits; "unavailable" when it could not answer. */
  search(q: string): Promise<PlayerHit[] | "unavailable">;
  /** profile_owner: the account behind a shown username, null for none; "unavailable" when it could not answer. */
  owner(username: string): Promise<string | null | "unavailable">;
  now?: () => number;
  /** Waits ms (tests pass their own). */
  sleep?: (ms: number) => Promise<void>;
  warn?: (msg: string) => void;
};

export const TTL_MS = 10 * 60_000;
export const BUDGET_MS = 1500;
export const MAX_HOSTS = 20;
/** Candidates whose name is the host's exactly, checked with profile_owner, at most. */
export const MAX_CHECKS = 3;
const MEMO_MAX = 5000;

const USERNAME = /^[a-z][a-z0-9_]{2,19}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const squash = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

class Unavailable extends Error {}

/** The name players_search is asked for (its 2 to 30 characters), or null when it is no name to look up. */
export function searchName(name: string | null | undefined): string | null {
  const s = String(name ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  if ([...s].length < 2 || s.toLowerCase() === "player" || s.startsWith("@")) return null;
  return [...s].slice(0, 30).join("").trim();
}

/** The host's shown username, or null. Throws when the database could not answer (not remembered). */
export async function findHostUsername(host: { id: string; name: string }, deps: Pick<HostLookupDeps, "search" | "owner">): Promise<string | null> {
  const q = searchName(host.name);
  if (!q) return null;
  const hits = await deps.search(q);
  if (hits === "unavailable") throw new Unavailable("players_search unavailable");
  const want = squash(host.name);
  const named = hits.filter((h) => USERNAME.test(h.u) && squash(h.name) === want).slice(0, MAX_CHECKS);
  for (const h of named) {
    const id = await deps.owner(h.u);
    if (id === "unavailable") throw new Unavailable("profile_owner unavailable");
    if (id && id.toLowerCase() === host.id.toLowerCase()) return h.u;
  }
  return null;
}

type Memo = { name: string; u: string | null; at: number };

/** A lookup with its own memory: lookup(hosts) -> account id -> username, for the hosts that have one. */
export function createHostLookup(deps: HostLookupDeps, opts: { ttlMs?: number; budgetMs?: number; maxHosts?: number } = {}) {
  const ttl = opts.ttlMs ?? TTL_MS;
  const budget = opts.budgetMs ?? BUDGET_MS;
  const maxHosts = opts.maxHosts ?? MAX_HOSTS;
  const now = deps.now ?? Date.now;
  const sleep =
    deps.sleep ??
    ((ms: number) =>
      new Promise<void>((r) => {
        const t = setTimeout(r, ms);
        (t as { unref?: () => void }).unref?.();
      }));
  const warn = deps.warn ?? ((m: string) => console.warn(m));
  const memo = new Map<string, Memo>();
  const inflight = new Map<string, Promise<string | null>>();

  function remember(id: string, m: Memo) {
    memo.delete(id);
    memo.set(id, m);
    if (memo.size > MEMO_MAX) memo.delete(memo.keys().next().value as string);
  }

  function start(id: string, name: string): Promise<string | null> {
    const key = `${id}\n${name}`;
    let p = inflight.get(key);
    if (!p) {
      p = findHostUsername({ id, name }, deps)
        .then((u) => {
          remember(id, { name, u, at: now() });
          return u;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, p);
    }
    return p;
  }

  return async function lookup(hosts: readonly HostRef[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const asked = new Map<string, string>();
    for (const h of hosts) {
      if (!h.id || !UUID.test(h.id) || asked.has(h.id)) continue;
      if (asked.size >= maxHosts) break;
      asked.set(h.id, String(h.name ?? "").trim());
    }
    const t = now();
    const pending: Promise<void>[] = [];
    for (const [id, name] of asked) {
      const hit = memo.get(id);
      if (hit && hit.name === name && t - hit.at < ttl) {
        if (hit.u) out.set(id, hit.u);
        continue;
      }
      pending.push(
        start(id, name).then(
          (u) => {
            if (u) out.set(id, u);
          },
          (e: unknown) => warn(`host profile: lookup failed (${e instanceof Error ? e.message : String(e)})`),
        ),
      );
    }
    if (pending.length) await Promise.race([Promise.all(pending), sleep(budget)]);
    // A copy: an answer that comes after the budget is remembered, not added to a list already used.
    return new Map(out);
  };
}
