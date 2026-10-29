// Paged reads of more rows than one PostgREST request returns.
// No "@/" imports so the build-data step (scripts/build-data.ts) and the
// unit tests compile it on their own.

// Supabase returns at most 1,000 rows per request; 500 keeps each
// statement well inside the 3 s timeout the public role has when the
// database is busy (a 1,000-row page of card columns took up to 2.98 s).
export const PAGE = 500;

/**
 * We have more turfs than one request returns. Page with .range()
 * until a page comes back short.
 * The page function must apply a stable order (rating, then id) so
 * rows never straddle two pages.
 *
 * A failed page throws rather than return part of the list, because a
 * partial list gets cached and shows wrong counts (a home title once
 * said 51 cities instead of 54). A throw keeps the last good cached page
 * or snapshot in place. No retries while serving: on 20 Oct three
 * retries per page turned one slow statement into four against a
 * database that was already overloaded. A production build retries a
 * page once, since a failed page there fails the whole deploy (pages
 * built from the build-data step's files make no such read).
 */
export async function fetchAllRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const retries = process.env.NEXT_PHASE === "phase-production-build" ? 1 : 0;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let res = await page(from, from + PAGE - 1);
    for (let attempt = 1; res.error && attempt <= retries; attempt++) {
      await new Promise((r) => setTimeout(r, 1500));
      res = await page(from, from + PAGE - 1);
    }
    if (res.error) {
      console.error("Paged fetch failed:", res.error);
      throw new Error(`Paged fetch failed at row ${from}`);
    }
    const rows = res.data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}
