import { unstable_cache } from "next/cache";
import { ALL_CHANGE_MARKS_S, changeMarkFor, type ChangeMarks } from "@/lib/cache/changeMarks";

/**
 * One tiny unstable_cache entry per mark: reading it lowers the page's
 * revalidate to the mark, only in that render (as markStaleRender and the
 * first life do). Untagged, nothing read. Each has a fixed name, so its key
 * is the same in every bundle.
 */
const MARKS = new Map(
  ALL_CHANGE_MARKS_S.map((s) => {
    const mark = async () => true;
    mark.toString = () => `page-change-mark-${s}`;
    return [s, unstable_cache(mark, ["page-change-mark-v1", String(s)], { revalidate: s })] as const;
  }),
);

/**
 * What this render shows goes out of date at `at` (epoch ms; null: never on
 * a clock): keep the page no longer than the first of `kind`'s marks after
 * it (lib/cache/changeMarks.ts), so it is rendered again soon after. Never
 * fails a render; harmless outside one.
 */
export async function keepUntil(at: number | null, kind: ChangeMarks, now: number = Date.now()): Promise<void> {
  if (at == null) return;
  const s = changeMarkFor((at - now) / 1000, kind);
  if (s == null) return;
  try {
    await MARKS.get(s)?.();
  } catch {
    // Only shortens the page's life; never fails it.
  }
}
