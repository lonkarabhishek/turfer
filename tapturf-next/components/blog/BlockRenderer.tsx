import Link from "next/link";
import Image from "next/image";
import { Star } from "lucide-react";
import type { Block } from "@/content/blog/types";
import { getBlogTurf } from "@/content/blog/data/turfs";
import { slugify } from "./TableOfContents";
import { PriceCalculator } from "./PriceCalculator";

/**
 * Renders a single content block. Server component (except where a
 * block is inherently interactive — those spawn their own client
 * components). Uses the existing Tailwind primary/accent tokens.
 */
export function BlockRenderer({ block }: { block: Block }) {
  switch (block.type) {
    case "p":
      return (
        <p className="text-[17px] leading-[1.75] text-primary-800 mb-5">
          {block.text}
        </p>
      );

    case "h2":
      return (
        <h2
          id={block.id ?? slugify(block.text)}
          className="font-display uppercase tracking-wide text-2xl md:text-3xl text-primary-900 mt-10 mb-4 scroll-mt-24"
        >
          {block.text}
        </h2>
      );

    case "h3":
      return (
        <h3
          id={block.id ?? slugify(block.text)}
          className="font-semibold text-lg md:text-xl text-primary-900 mt-8 mb-3 scroll-mt-24"
        >
          {block.text}
        </h3>
      );

    case "ul":
      return (
        <ul className="list-disc pl-6 mb-6 space-y-2 marker:text-accent-500">
          {block.items.map((item, i) => (
            <li key={i} className="text-[17px] leading-[1.7] text-primary-800">
              {item}
            </li>
          ))}
        </ul>
      );

    case "ol":
      return (
        <ol className="list-decimal pl-6 mb-6 space-y-2 marker:text-accent-500 marker:font-semibold">
          {block.items.map((item, i) => (
            <li key={i} className="text-[17px] leading-[1.7] text-primary-800">
              {item}
            </li>
          ))}
        </ol>
      );

    case "quote":
      return (
        <blockquote className="border-l-4 border-accent-500 pl-5 py-2 my-6 text-[17px] italic text-primary-700 bg-accent-50/40 rounded-r-lg">
          <p>&ldquo;{block.text}&rdquo;</p>
          {block.by && (
            <footer className="mt-2 text-sm not-italic text-primary-500">
              — {block.by}
            </footer>
          )}
        </blockquote>
      );

    case "callout":
      return (
        <aside className="my-8 rounded-2xl border border-accent-200 bg-accent-50/60 p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-accent-600 mb-2">
            {block.title}
          </p>
          <p className="text-[16px] leading-[1.65] text-primary-800">
            {block.text}
          </p>
        </aside>
      );

    case "cta": {
      const isExternal = block.href.startsWith("http") || block.href.startsWith("mailto:");
      return (
        <div className="my-8 rounded-2xl bg-primary-900 text-white p-6 md:p-7 flex flex-col md:flex-row md:items-center md:justify-between gap-4 not-prose">
          <p className="text-[16px] md:text-lg leading-snug">{block.text}</p>
          {isExternal ? (
            <a
              href={block.href}
              className="inline-flex items-center justify-center rounded-full bg-accent-500 hover:bg-accent-400 text-white font-semibold text-sm uppercase tracking-wide px-5 py-3 shadow-neon transition-colors whitespace-nowrap"
            >
              {block.label}
            </a>
          ) : (
            <Link
              href={block.href}
              className="inline-flex items-center justify-center rounded-full bg-accent-500 hover:bg-accent-400 text-white font-semibold text-sm uppercase tracking-wide px-5 py-3 shadow-neon transition-colors whitespace-nowrap"
            >
              {block.label}
            </Link>
          )}
        </div>
      );
    }

    case "turf":
      return (
        <Link
          href={`/turf/${block.id}`}
          className="group block my-6 rounded-2xl border border-primary-200 bg-white hover:border-accent-300 hover:shadow-elevated transition-all overflow-hidden not-prose"
        >
          <div className="flex items-stretch">
            {block.rank !== undefined && (
              <div className="flex-shrink-0 w-16 md:w-20 bg-primary-900 text-white flex items-center justify-center">
                <span className="font-display text-3xl md:text-4xl leading-none">
                  {block.rank}
                </span>
              </div>
            )}
            <div className="flex-1 p-5">
              <div className="flex items-start justify-between gap-3 mb-1.5">
                <h3 className="font-semibold text-lg md:text-xl text-primary-900 group-hover:text-accent-600 transition-colors leading-tight">
                  {block.name}
                </h3>
                {block.rating !== undefined && (
                  <span className="flex-shrink-0 inline-flex items-center gap-1 rounded-full bg-accent-50 border border-accent-200 px-2.5 py-1 text-xs font-bold text-accent-700">
                    ★ {block.rating}
                    {block.reviews !== undefined && (
                      <span className="text-accent-500 font-medium">({block.reviews})</span>
                    )}
                  </span>
                )}
              </div>
              <p className="text-sm text-primary-500 mb-2">{block.area}</p>
              {block.note && (
                <p className="text-[15px] leading-snug text-primary-700">{block.note}</p>
              )}
              <p className="mt-3 text-xs font-bold uppercase tracking-widest text-accent-600 group-hover:text-accent-700">
                View turf &rarr;
              </p>
            </div>
          </div>
        </Link>
      );

    case "stat-grid":
      return (
        <div className="not-prose my-8 grid grid-cols-2 md:grid-cols-4 gap-3">
          {block.items.map((s, i) => (
            <div
              key={i}
              className="rounded-2xl border border-primary-200 bg-white p-4 flex flex-col"
            >
              <span className="font-display text-3xl md:text-4xl text-primary-900 leading-none tabular-nums">
                {s.value}
              </span>
              <span className="mt-2 text-xs font-bold uppercase tracking-widest text-accent-600">
                {s.label}
              </span>
              {s.hint && (
                <span className="mt-1 text-[12px] text-primary-500 leading-snug">
                  {s.hint}
                </span>
              )}
            </div>
          ))}
        </div>
      );

    case "table":
      return (
        <figure className="not-prose my-8 rounded-2xl border border-primary-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-primary-50 text-primary-500 text-[11px] uppercase tracking-widest">
                <tr>
                  {block.columns.map((c, i) => (
                    <th
                      key={i}
                      className="text-left px-4 py-3 font-semibold whitespace-nowrap"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white">
                {block.rows.map((row, i) => (
                  <tr
                    key={i}
                    className={i % 2 === 0 ? "bg-white" : "bg-primary-50/40"}
                  >
                    {row.map((cell, j) => (
                      <td
                        key={j}
                        className={`px-4 py-3 ${j === 0 ? "font-semibold text-primary-800" : "text-primary-700"}`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {block.caption && (
            <figcaption className="px-4 py-2 text-xs text-primary-500 bg-primary-50 border-t border-primary-100">
              {block.caption}
            </figcaption>
          )}
        </figure>
      );

    case "faq":
      return (
        <div className="not-prose my-8 space-y-2">
          {block.items.map((qa, i) => (
            <details
              key={i}
              className="group rounded-2xl border border-primary-200 bg-white open:border-accent-300 transition-colors"
            >
              <summary className="cursor-pointer list-none px-5 py-4 flex items-start justify-between gap-4">
                <span className="font-semibold text-primary-900">{qa.q}</span>
                <span
                  aria-hidden
                  className="mt-0.5 shrink-0 w-6 h-6 rounded-full border border-primary-300 flex items-center justify-center text-primary-500 group-open:rotate-45 group-open:border-accent-500 group-open:text-accent-500 transition-all"
                >
                  +
                </span>
              </summary>
              <div className="px-5 pb-5 text-[15px] leading-[1.7] text-primary-700">
                {qa.a}
              </div>
            </details>
          ))}
        </div>
      );

    case "related-turfs": {
      const turfs = block.ids
        .map((id) => getBlogTurf(id))
        .filter((t): t is NonNullable<typeof t> => !!t);
      if (turfs.length === 0) return null;
      return (
        <div className="not-prose my-8">
          {block.title && (
            <h3 className="font-display uppercase tracking-wide text-primary-900 text-xl md:text-2xl mb-4">
              {block.title}
            </h3>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {turfs.map((t) => (
              <Link
                key={t.id}
                href={`/turf/${t.id}`}
                className="group flex rounded-2xl border border-primary-200 hover:border-accent-400 bg-white hover:shadow-card-hover overflow-hidden transition-all"
              >
                <div className="relative w-28 h-28 shrink-0 bg-primary-100">
                  {t.coverImage ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={t.coverImage}
                      alt={`${t.name} turf photo`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-accent-300 to-accent-500 flex items-center justify-center">
                      <span className="text-white font-display text-xl">
                        {t.name.slice(0, 1)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex-1 p-3 min-w-0">
                  <p className="font-semibold text-primary-900 group-hover:text-accent-700 truncate text-[15px]">
                    {t.name}
                  </p>
                  <p className="text-xs text-primary-500 truncate mt-0.5">
                    {t.area}
                  </p>
                  {t.rating != null && (
                    <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-accent-700">
                      <Star className="w-3 h-3 fill-accent-500 text-accent-500" />
                      {t.rating.toFixed(1)}
                      {t.reviews != null && (
                        <span className="text-primary-400 font-medium">
                          · {t.reviews.toLocaleString("en-IN")}
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      );
    }

    case "price-calc":
      return <PriceCalculator defaults={block.defaults} caption={block.caption} />;

    case "image": {
      // Article images are always full-width, aspect 16/9. Next Image
      // with sizes: 100vw and priority off (hero uses its own path in
      // the page layout, not this block).
      return (
        <figure className="not-prose my-8">
          <div className="relative w-full aspect-[16/9] rounded-2xl overflow-hidden bg-primary-100">
            <Image
              src={block.src}
              alt={block.alt}
              fill
              sizes="(max-width: 768px) 100vw, 800px"
              className="object-cover"
              unoptimized={block.src.endsWith(".webp") && !block.src.includes("googleusercontent")}
            />
          </div>
          {block.caption && (
            <figcaption className="mt-2 text-xs text-primary-500 text-center">
              {block.caption}
            </figcaption>
          )}
        </figure>
      );
    }

    default: {
      // Exhaustiveness check.
      const _never: never = block;
      void _never;
      return null;
    }
  }
}
