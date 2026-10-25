/**
 * Ask TapTurf on a blog post: what /api/ask sends back for a summary of
 * the article or an answer to a question about it (AskResponse.blog).
 * Types only, shared by the route, the answerer and the chat.
 *
 * Everything a reader is shown is either the model's words about the
 * article or our own data: charts are built on the server from the
 * article's tables, or from numbers checked against its text; section,
 * source and venue links come from the article's own blocks, picked by
 * number. Web answers carry the pages the search actually returned.
 */

/** A section of the article, by its heading. id is the heading's anchor on the page (null: the opening, before the first heading). */
export type BlogSection = { n: number; title: string; id: string | null };

/** A page linked from the answer: one the article cites, or one a web search returned. */
export type BlogLink = { label: string; url: string; host: string };

/** A venue the article features (its turf cards), linked to its TapTurf page. */
export type BlogTurf = { id: string; name: string; area: string };

export type BlogBar = { label: string; value: number; display: string };

export type BlogVisual =
  /** Horizontal bars, one series. note: where the numbers come from ("Listed rates, per hour"). */
  | { kind: "bars"; title: string; unit: string | null; note: string | null; bars: BlogBar[] }
  /** A process, in order. */
  | { kind: "steps"; title: string; steps: { title: string; detail: string }[] }
  /** Two or three things side by side. */
  | { kind: "compare"; title: string; columns: string[]; rows: { label: string; values: string[] }[] }
  /** A few headline numbers. */
  | { kind: "stats"; title: string; stats: { value: string; label: string }[] }
  /** An illustration drawn on request: the chat loads it from /api/ask/art?t=<token>. */
  | { kind: "art"; title: string; alt: string; token: string };

export type BlogAnswer = {
  slug: string;
  title: string;
  readMinutes: number;
  /** summary: "Summarize this blog". answer: any other question about it. Missing on summaries from before answers existed. */
  mode?: "summary" | "answer";
  /**
   * ai: written by the model from the article. outline: no model (the
   * article's description and headings). web: the article doesn't cover
   * it, so a web search answered (sources in `web`).
   */
  kind: "ai" | "outline" | "web";
  /** summary: the article's point in one sentence. answer: "" (the reply is the answer). */
  gist: string;
  points: string[];
  visual?: BlogVisual | null;
  /** Sections of this article the answer comes from. */
  sections?: BlogSection[];
  /** Pages the article itself cites that back the answer. */
  sources?: BlogLink[];
  /** Pages a web search returned, for kind web. */
  web?: BlogLink[];
  /** Venues from the article the answer is about. */
  turfs?: BlogTurf[];
  cta: { href: string; label: string } | null;
};
