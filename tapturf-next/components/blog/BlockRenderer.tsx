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

    default: {
      // Exhaustiveness check.
      const _never: never = block;
      return null;
    }
  }
}
