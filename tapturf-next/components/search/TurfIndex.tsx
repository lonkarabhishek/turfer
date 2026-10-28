import { createElement } from "react";
import { ChevronDown } from "lucide-react";
import { turfPath } from "@/lib/utils/turfPath";
import type { Turf } from "@/types/turf";

export type IndexGroup = { label: string | null; turfs: Pick<Turf, "id" | "slug" | "name" | "area">[] };

/**
 * Every turf in scope as a plain link, A to Z, under one disclosure: the
 * listing renders only its first cards now, and this keeps a crawlable link
 * to every turf in the server HTML. Bytes matter here (3,600 turfs on all
 * of India): each turf is one bare <a> (no list item, no client component,
 * no prefetch), passed as positional children so it needs no key, which
 * costs about 130 bytes of HTML and RSC payload per turf. A city's list
 * names the area too (several turfs share a name); all of India is
 * grouped by city instead.
 */
export function TurfIndex({ title, groups, withArea }: { title: string; groups: IndexGroup[]; withArea: boolean }) {
  if (!groups.some((g) => g.turfs.length > 0)) return null;
  return (
    <details id="all-turfs" className="group mt-14" style={{ scrollMarginTop: "4.5rem" }}>
      <summary className="cursor-pointer list-none flex items-center justify-between gap-3 rounded-2xl bg-primary-50 hover:bg-primary-100 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <h2 className="text-[17px] font-semibold text-primary-900">{title}</h2>
        <ChevronDown className="w-5 h-5 shrink-0 text-primary-500 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <nav aria-label={title} className="mt-4 px-1 [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-[15px] [&_h3]:font-semibold [&_h3]:text-primary-900">
        {groups.map((g, gi) =>
          g.turfs.length === 0 ? null : (
            <section key={gi}>
              {g.label && <h3>{g.label}</h3>}
              {createElement(
                "div",
                { className: "sm:columns-2 lg:columns-3 gap-8 text-[14px] [&>a]:block [&>a]:py-1 [&>a]:break-inside-avoid [&>a]:text-primary-900 [&>a:hover]:text-accent-600" },
                ...g.turfs.map((t) => createElement("a", { href: turfPath(t) }, withArea && t.area ? `${t.name} · ${t.area}` : t.name)),
              )}
            </section>
          ),
        )}
      </nav>
    </details>
  );
}

/** A to Z by name (numbers in names sort as numbers: Arena 2 before Arena 10). */
export function byName(a: Pick<Turf, "name">, b: Pick<Turf, "name">): number {
  return a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true });
}
