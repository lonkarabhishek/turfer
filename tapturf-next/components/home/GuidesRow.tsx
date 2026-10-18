import Link from "next/link";
import { ArrowUpRight, BookOpen } from "lucide-react";
import { HideOnErrorImg } from "@/components/ui/HideOnErrorImg";
import type { HomePost } from "@/lib/home/types";

/** The three newest guides, with their art when they have it. */
export function GuidesRow({ posts }: { posts: HomePost[] }) {
  if (posts.length === 0) return null;
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 mt-12" aria-labelledby="guides-h">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="guides-h" className="font-display text-2xl md:text-3xl text-primary-800 tracking-tight">
            Guides from the ground
          </h2>
          <p className="text-[13px] text-primary-500 mt-1">Prices, rules, tactics and the best turfs by city.</p>
        </div>
        <Link
          href="/blog"
          className="hidden sm:inline-flex items-center gap-1 text-sm font-semibold text-accent-600 hover:text-accent-700 whitespace-nowrap"
        >
          All guides <ArrowUpRight className="w-4 h-4" />
        </Link>
      </div>
      <ul className="-mx-4 px-4 sm:mx-0 sm:px-0 mt-4 flex gap-3 overflow-x-auto snap-x scroll-px-4 scrollbar-hide md:grid md:grid-cols-3 md:gap-5 md:overflow-visible">
        {posts.map((p) => (
          <li key={p.slug} className="w-[260px] shrink-0 snap-start md:w-auto">
            <Link
              href={`/blog/${p.slug}`}
              className="block h-full rounded-2xl border border-primary-200 bg-white overflow-hidden card-lift press-tight focus-neon"
            >
              <div className="relative aspect-[16/10] bg-accent-50">
                <BookOpen className="absolute inset-0 m-auto w-8 h-8 text-accent-300" aria-hidden />
                {p.hero && (
                  <HideOnErrorImg
                    src={p.hero.url}
                    alt={p.hero.alt}
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}
              </div>
              <div className="p-4">
                <p className="text-[12px] font-semibold text-accent-700">
                  {p.category} {"·"} {p.readMinutes} min read
                </p>
                <p className="mt-1 text-[16px] font-semibold text-primary-900 leading-snug line-clamp-2">{p.title}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href="/blog"
        className="sm:hidden mt-3 flex h-11 items-center justify-center rounded-full border border-primary-200 text-[15px] font-semibold text-primary-900 press-tight focus-neon"
      >
        All guides
      </Link>
    </section>
  );
}
