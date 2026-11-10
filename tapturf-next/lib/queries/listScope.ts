import { AsyncLocalStorage } from "node:async_hooks";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { GAMES_TAG, isListScope, listTag } from "@/lib/cache/listTags";

/**
 * Which list pages this render is (lib/cache/listTags.ts): a city's own
 * pages, or all of India's. A page says so before its first turf read
 * (setListScope, right after it has its params, in generateMetadata, the
 * page and a layout alike: Next may run them in either order); the sitemap,
 * a route and not a render, runs inside withListScope.
 *
 * In a scoped render the shared reads that sit in Next's data cache with an
 * hour or 10 minute life and the old "turf-data" tag (the list version, the
 * trending picks, the live cities, the home's picks and games) are read
 * fresh, once per render (React cache), and the page takes its tag from a
 * marker instead (tagRender): an unstable_cache read gives the page its
 * tags and lowers its revalidate to its own, so through those entries a
 * city page would be marked stale by every city's purge and kept an hour
 * at most. A page Vercel regenerates skips the data cache anyway (its
 * reads are always fresh); only a first render pays the one small read.
 *
 * With no scope (route handlers, a page that sets none) every read is as
 * before: the cached entries, the old tag, purged by every list post. A
 * render whose scope is unclear (two different ones) drops back to that
 * too. Either way a mistake here costs a purge too many, never one too few.
 */

const UNSET = Symbol("unset");
const cell = cache((): { scope: string | null | typeof UNSET } => ({ scope: UNSET }));
const storage = new AsyncLocalStorage<string>();

function requestCell(): { scope: string | null | typeof UNSET } | null {
  try {
    return cell();
  } catch {
    return null;
  }
}

/** This render shows `scope`'s lists (a city slug, or INDIA). Call before its first turf read. */
export function setListScope(scope: string): void {
  const c = requestCell();
  if (!c) return;
  const next = isListScope(scope) ? scope : null;
  // A second, different scope: unclear, so the old tag for whatever reads next.
  c.scope = c.scope === UNSET || c.scope === next ? next : null;
}

/** Runs `fn` (a route such as the sitemap, outside any React render) with `scope`. */
export function withListScope<T>(scope: string, fn: () => Promise<T>): Promise<T> {
  return isListScope(scope) ? storage.run(scope, fn) : fn();
}

/** The scope of this render, or null (unscoped: the old reads and tag). */
export function listScope(): string | null {
  const s = storage.getStore();
  if (s) return s;
  const c = requestCell();
  return c && c.scope !== UNSET ? c.scope : null;
}

const marks = new Map<string, () => Promise<boolean>>();

/**
 * Gives this render `tag`: a tiny unstable_cache entry carrying it, with no
 * timer (revalidate false never lowers the page's revalidate) and nothing
 * read. Its name is fixed, so its key is the same in every bundle. Never
 * fails a render.
 */
export async function tagRender(tag: string): Promise<void> {
  let mark = marks.get(tag);
  if (!mark) {
    const fn = async () => true;
    fn.toString = () => `render-tag-${tag}`;
    mark = unstable_cache(fn, ["render-tag-v1", tag], { revalidate: false, tags: [tag] });
    marks.set(tag, mark);
  }
  try {
    await mark();
  } catch {
    // Only a tag; the page's other reads still carry theirs.
  }
}

/** This render shows open games: the games key purges it (app/api/revalidate). */
export function tagGamesRender(): Promise<void> {
  return tagRender(GAMES_TAG);
}

/**
 * A shared read for this render: in a scoped render the page's scope tag
 * and `fresh()` (React-cached by the caller), else the cached entry.
 */
export async function scopedRead<T>(fresh: () => Promise<T>, cached: () => Promise<T>): Promise<T> {
  const scope = listScope();
  if (!scope) return cached();
  await tagRender(listTag(scope));
  return fresh();
}
