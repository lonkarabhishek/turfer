"use client";

import Link from "next/link";
import type { Block } from "@/content/blog";

/**
 * Table of contents built from the article's h2 (and optional h3)
 * blocks. Anchor slugs match the h2 id emitted by BlockRenderer.
 * Renders only when the article has ≥3 h2s — a 2-item TOC is noise.
 */
export function TableOfContents({ blocks }: { blocks: Block[] }) {
  const items = blocks
    .filter((b): b is Extract<Block, { type: "h2" }> => b.type === "h2")
    .map((b) => ({ id: b.id ?? slugify(b.text), text: b.text }));

  if (items.length < 3) return null;

  return (
    <nav
      aria-label="On this page"
      className="not-prose my-6 rounded-2xl border border-primary-200 bg-primary-50/50 p-4 sm:p-5"
    >
      <p className="text-[11px] font-bold uppercase tracking-widest text-primary-500 mb-3">
        On this page
      </p>
      <ol className="space-y-1.5 text-sm">
        {items.map((it, i) => (
          <li key={it.id} className="flex gap-2">
            <span className="text-primary-400 tabular-nums w-5 shrink-0">
              {String(i + 1).padStart(2, "0")}
            </span>
            <Link
              href={`#${it.id}`}
              className="text-primary-700 hover:text-accent-600 underline underline-offset-4 decoration-primary-200 hover:decoration-accent-500"
            >
              {it.text}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
