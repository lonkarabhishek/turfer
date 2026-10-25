import type { BlogAnswer, BlogLink, BlogSection, BlogTurf, BlogVisual } from "@/lib/ask/blogTypes";

/**
 * The pure parts of the chat's blog answers (BlogAnswer.tsx, BlogVisual.tsx,
 * AskPanel.tsx), kept apart so they can be tested without a browser.
 * The thread comes back from sessionStorage, so every field is checked.
 */

/** The line under "Short on time?": a chart is promised only when the article has numbers to chart. */
export function articleWelcome(charts: boolean): string {
  return charts
    ? "I can give you the short version, chart its numbers, or answer anything about this article."
    : "I can give you the short version or answer anything about this article.";
}

/** Whether BlogVisualView draws anything for this visual. */
export function visualShows(v: BlogVisual | null | undefined): boolean {
  switch (v?.kind) {
    case "bars":
      return Array.isArray(v.bars) && v.bars.length > 0;
    case "steps":
      return Array.isArray(v.steps) && v.steps.length > 0;
    case "compare":
      return Array.isArray(v.columns) && v.columns.length > 0 && Array.isArray(v.rows) && v.rows.length > 0;
    case "stats":
      return Array.isArray(v.stats) && v.stats.length > 0;
    case "art":
      return typeof v.token === "string" && v.token !== "";
    default:
      return false;
  }
}

// Only real web pages: check before linking.
const isWeb = (l: BlogLink) => !!l && typeof l.url === "string" && /^https?:\/\//i.test(l.url) && typeof l.label === "string";

export const AI_NOTE = "Written by AI from the article. Prices and timings can change.";
export const WEB_NOTE = "Answered by AI from a web search. Check the sources.";

export type CardView = {
  /** The short version (or, with outline, what the article covers), rather than an answer. */
  summary: boolean;
  outline: boolean;
  web: boolean;
  gist: string;
  points: string[];
  visual: boolean;
  sections: BlogSection[];
  cited: BlogLink[];
  pages: BlogLink[];
  turfs: BlogTurf[];
  /** Nothing from the article and no web pages: a greeting or an off-topic steer back. */
  empty: boolean;
  /** The article's button, unless the reply has nothing to do with the article. */
  cta: BlogAnswer["cta"];
  /** The small print under the card, if any. */
  note: string | null;
};

/** What a blog answer card shows, worked out from the answer as saved. */
export function blogCardView(blog: BlogAnswer): CardView {
  // No mode: saved before answers existed, when every one was a summary.
  const summary = blog.mode !== "answer";
  const outline = blog.kind === "outline";
  const web = blog.kind === "web";
  const gist = typeof blog.gist === "string" ? blog.gist.trim() : "";
  const points = Array.isArray(blog.points) ? blog.points.filter((p) => typeof p === "string" && p.trim() !== "") : [];
  const visual = visualShows(blog.visual);
  // A web answer is one the article doesn't cover: none of its sections,
  // citations or venues is a source for it (answers saved before the
  // server dropped them can still carry some).
  const sections = web || !Array.isArray(blog.sections) ? [] : blog.sections.filter((s) => !!s && typeof s.title === "string");
  const cited = web || !Array.isArray(blog.sources) ? [] : blog.sources.filter(isWeb);
  const pages = Array.isArray(blog.web) ? blog.web.filter(isWeb) : [];
  const turfs =
    web || !Array.isArray(blog.turfs) ? [] : blog.turfs.filter((t) => !!t && typeof t.id === "string" && t.id !== "" && typeof t.name === "string");
  const empty = !gist && !points.length && !visual && !sections.length && !cited.length && !pages.length && !turfs.length;
  const cta = empty ? null : (blog.cta ?? null);
  const note = empty ? null : blog.kind === "ai" ? AI_NOTE : web ? WEB_NOTE : null;
  return { summary, outline, web, gist, points, visual, sections, cited, pages, turfs, empty, cta, note };
}

/** A section's link: its heading's anchor, or the article itself for the opening (S0). */
export function sectionHref(articleHref: string, s: Pick<BlogSection, "id">): string {
  return s.id ? `${articleHref}#${s.id}` : articleHref;
}

/** A click the page handles itself: the main button with no modifier (those open a new tab or window). */
export function isPlainClick(e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented: boolean }): boolean {
  return !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

/** What jumpToSection needs from the browser (passed in, so tests can stand in for it). */
export type JumpEnv = {
  frame: (f: () => void) => void;
  /** False while the chat still holds the page still (AskPanel sets body overflow hidden on phones). */
  canScroll: () => boolean;
  find: (id: string) => { scrollIntoView: (o?: { block?: "start" | "center" | "end" | "nearest" }) => void } | null;
  toTop: () => void;
  /** Point the address bar at the section (null: the opening, no hash) without a navigation. */
  setHash: (id: string | null) => void;
};

/** Frames to wait for the page to scroll again before scrolling anyway. */
const JUMP_FRAMES = 10;

/**
 * Scroll the article to one of its sections once the chat has closed.
 * Next scrolls to a hash only when the hash changes, so a second tap on
 * the same section (or after the table of contents went there) would
 * close the chat and leave the page where it was: the page scrolls
 * itself, every time. It waits for the closed chat to give the page its
 * scrolling back, then scrolls (smoothly, unless the reader asked for
 * less motion: the page's CSS decides) and sets the hash to match.
 */
export function jumpToSection(id: string | null, env: JumpEnv, framesLeft = JUMP_FRAMES): void {
  env.frame(() => {
    if (!env.canScroll() && framesLeft > 1) return jumpToSection(id, env, framesLeft - 1);
    const el = id ? env.find(id) : null;
    if (el) el.scrollIntoView({ block: "start" });
    else if (!id) env.toTop();
    env.setHash(id);
  });
}
