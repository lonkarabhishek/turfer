"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ArrowRight, ExternalLink, FileText, MapPin } from "lucide-react";
import { useAsk } from "./AskProvider";
import { BlogVisualView } from "./BlogVisual";
import { blogCardView, isPlainClick, jumpToSection, sectionHref, type CardView, type JumpEnv } from "./blogUi";
import type { BlogAnswer, BlogLink } from "@/lib/ask/blogTypes";
import { turfPath } from "@/lib/utils/turfPath";

/**
 * What shows under a reply about a blog post: the short version (its
 * point and takeaways) or an answer's key points, a chart, steps or
 * picture when one helps, then where it all comes from: the article's
 * sections, the pages it cites, the web pages a search used, the venues
 * it names. Replies saved in the thread before answers had sources
 * carry only the short version, and show just that. A greeting or an
 * off-topic steer back has nothing from the article: no button, no small
 * print, only a way back to the article when read elsewhere.
 */
export function BlogAnswerCard({ blog }: { blog: BlogAnswer }) {
  const { closePanel } = useAsk();
  const pathname = usePathname();
  const href = `/blog/${blog.slug}`;
  const here = pathname === href;
  const view = blogCardView(blog);
  const { summary, outline, web, gist, points } = view;
  if (view.empty && here) return null;
  return (
    <div className="space-y-3">
      {view.empty ? null : summary || outline ? (
        // The short version, or (no model) what the article covers.
        <div className="rounded-2xl bg-accent-50 px-4 py-3.5">
          <p className="flex items-baseline justify-between gap-3 text-[11px]">
            <span className="font-semibold uppercase tracking-wide text-accent-800">{outline ? "What it covers" : "The gist"}</span>
            {summary && !outline && blog.readMinutes > 1 && <span className="text-primary-500">Saves a {blog.readMinutes} min read</span>}
          </p>
          {gist && <p className="mt-1.5 text-[15px] font-medium text-primary-900 leading-relaxed">{gist}</p>}
          {points.length > 0 && <Points points={points} className={gist ? "mt-2.5" : "mt-2"} />}
        </div>
      ) : (
        // An answer: the reply above is the answer, its points follow it.
        (web || points.length > 0) && (
          <div>
            {web && (
              <p className="mb-2 flex items-baseline justify-between gap-3 text-[11px]">
                <span className="font-semibold uppercase tracking-wide text-accent-800">From the web</span>
                <span className="text-primary-500">The article doesn&rsquo;t cover this</span>
              </p>
            )}
            {points.length > 0 && <Points points={points} />}
          </div>
        )
      )}

      {view.visual && blog.visual && <BlogVisualView visual={blog.visual} />}

      <Sources view={view} slug={blog.slug} here={here} />

      {(view.cta || !here) && (
        <div className="flex flex-wrap items-center gap-2">
          {view.cta && (
            <Link href={view.cta.href} onClick={closePanel} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-primary-900 hover:bg-accent-600 text-white text-[13px] font-semibold cursor-pointer transition-colors">
              {view.cta.label} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
          {/* Read away from the article (the thread follows the player): a way back to it. */}
          {!here && (
            <Link href={href} onClick={closePanel} className="inline-flex items-center gap-1 h-10 px-1 text-[13px] font-semibold text-accent-700 hover:text-accent-800 cursor-pointer">
              Read the article <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      )}

      {view.note && <p className="text-[11px] text-primary-400">{view.note}</p>}
    </div>
  );
}

function Points({ points, className = "" }: { points: string[]; className?: string }) {
  return (
    <ul role="list" className={`space-y-2 ${className}`}>
      {points.map((p, i) => (
        <li key={i} className="flex gap-2.5 text-[14px] text-primary-800 leading-snug">
          <span className="mt-[7px] w-1.5 h-1.5 shrink-0 rounded-full bg-accent-500" aria-hidden />
          <span>{p}</span>
        </li>
      ))}
    </ul>
  );
}

const ROW = "flex min-h-10 items-center gap-2.5 -mx-2 px-2 rounded-xl text-[13px] text-primary-800 hover:bg-primary-50 cursor-pointer transition-colors";
const ICON = "w-4 h-4 shrink-0 text-primary-400";

/** The page this chat sits on, for jumping to a section of it. */
const pageJump: JumpEnv = {
  frame: (f) => window.requestAnimationFrame(f),
  // AskPanel holds the page still on phones until its effect cleans up.
  canScroll: () => document.body.style.overflow !== "hidden",
  find: (id) => document.getElementById(id),
  toTop: () => window.scrollTo({ top: 0 }),
  // A null state: Next keeps its own and moves its router to the new URL, so it never puts the old one back.
  setHash: (id) => window.history.replaceState(null, "", id ? `#${id}` : `${window.location.pathname}${window.location.search}`),
};

/**
 * Where the answer comes from, one line each: the article's sections
 * (tap to jump there), the pages the article cites, the pages a web
 * search used, and the venues it names. Nothing to show, no block.
 */
function Sources({ view, slug, here }: { view: CardView; slug: string; here: boolean }) {
  const { closePanel } = useAsk();
  const href = `/blog/${slug}`;
  const { sections, cited, pages, turfs } = view;
  if (!sections.length && !cited.length && !pages.length && !turfs.length) return null;
  const toSection = (id: string | null) => (e: MouseEvent<HTMLAnchorElement>) => {
    // Another page: close the chat and let Next go there (it scrolls to the hash on arrival).
    if (!here) return closePanel();
    // A new tab or window: leave it to the browser, and the chat open.
    if (!isPlainClick(e)) return;
    // This page: Next scrolls only when the hash changes, so the page scrolls itself once the chat is closed.
    e.preventDefault();
    closePanel();
    jumpToSection(id, pageJump);
  };
  return (
    <div className="rounded-2xl border border-primary-100 bg-white px-3.5 pt-3 pb-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-500">Sources</p>
      {sections.length > 0 && (
        <Group label="In this article">
          {sections.map((s) => (
            <li key={`${s.n}-${s.id}`}>
              <Link href={sectionHref(href, s)} onClick={toSection(s.id)} className={ROW}>
                <FileText className={ICON} aria-hidden />
                {/* S0 is the part before the first heading. */}
                <span className="min-w-0 flex-1 truncate">{s.n === 0 ? "Introduction" : s.title}</span>
              </Link>
            </li>
          ))}
        </Group>
      )}
      {cited.length > 0 && <Group label="The article's sources">{cited.map((l) => <WebRow key={l.url} link={l} />)}</Group>}
      {pages.length > 0 && <Group label="From the web">{pages.map((l) => <WebRow key={l.url} link={l} />)}</Group>}
      {turfs.length > 0 && (
        <Group label="Venues">
          {turfs.map((t) => (
            <li key={t.id}>
              <Link href={turfPath({ id: t.id })} onClick={closePanel} className={ROW}>
                <MapPin className={ICON} aria-hidden />
                {/* The name first; the area takes what room is left. */}
                <span className="max-w-[65%] shrink-0 truncate font-medium">{t.name}</span>
                {t.area && <span className="ml-auto min-w-0 truncate text-[12px] text-primary-400">{t.area}</span>}
              </Link>
            </li>
          ))}
        </Group>
      )}
    </div>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-2">
      <p className="text-[12px] text-primary-400">{label}</p>
      <ul role="list">{children}</ul>
    </div>
  );
}

function WebRow({ link }: { link: BlogLink }) {
  return (
    <li>
      <a href={link.url} target="_blank" rel="noopener noreferrer nofollow" className={ROW}>
        <ExternalLink className={ICON} aria-hidden />
        <span className="min-w-0 truncate">{link.label || link.host}</span>
        {link.host && <span className="ml-auto max-w-[45%] shrink-0 truncate text-[12px] text-primary-400">{link.host}</span>}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </li>
  );
}
