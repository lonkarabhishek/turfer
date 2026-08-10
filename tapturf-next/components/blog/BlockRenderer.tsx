import Link from "next/link";
import type { Block } from "@/content/blog/types";

/**
 * Renders a single content block. Server component. Uses only the
 * existing Tailwind primary/accent tokens so the blog inherits the
 * TapTurf look with no new CSS.
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
        <h2 className="font-display uppercase tracking-wide text-2xl md:text-3xl text-primary-900 mt-10 mb-4">
          {block.text}
        </h2>
      );

    case "h3":
      return (
        <h3 className="font-semibold text-lg md:text-xl text-primary-900 mt-8 mb-3">
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
              , {block.by}
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
      const isExternal =
        block.href.startsWith("http") || block.href.startsWith("mailto:");
      return (
        <div className="my-8 rounded-2xl bg-primary-900 text-white p-6 md:p-7 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
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
          className="group block my-6 rounded-2xl border border-primary-200 bg-white hover:border-accent-300 hover:shadow-elevated transition-all overflow-hidden"
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
                      <span className="text-accent-500 font-medium">
                        ({block.reviews})
                      </span>
                    )}
                  </span>
                )}
              </div>
              <p className="text-sm text-primary-500 mb-2">{block.area}</p>
              {block.note && (
                <p className="text-[15px] leading-snug text-primary-700">
                  {block.note}
                </p>
              )}
              <p className="mt-3 text-xs font-bold uppercase tracking-widest text-accent-600 group-hover:text-accent-700">
                View turf &rarr;
              </p>
            </div>
          </div>
        </Link>
      );

    default: {
      // Exhaustiveness check.
      const _never: never = block;
      return null;
    }
  }
}
