import type { Block, Post } from "@/content/blog";

/**
 * Ask on a blog post: the chip and nudge that offer the short version of
 * the article, the reading of a message as asking for it, and the
 * article as plain text for the model. Pure (type imports only), so the
 * chat's chips and loader lines and /api/ask agree.
 */

export const SUMMARY_CHIP = "Summarize this blog";

// "summarise", "sumarize", "summerize", "summary", "tl;dr", "gist", "saar", "सारांश".
const SUMMARY = /\b(su+m+[ae]ri[sz]e|su+m+[ae]ry|tl ?;? ?dr|gist|key (points|takeaways)|main points|short version|in short|in brief|saar|saransh)\b|सारांश|सार/;
const ABOUT = /\bwhat('?s| is)( this| the)? (blog|article|post) about\b/;

/** True when the message asks for the short version of the page's article (not, say, a venue's reviews). */
export function isSummaryAsk(q: string): boolean {
  const t = q.toLowerCase().replace(/\s+/g, " ").trim();
  return (SUMMARY.test(t) || ABOUT.test(t)) && !/\breviews?\b/.test(t);
}

/** Most of an article; the longest post is about a third of this. */
const MAX_TEXT = 30_000;

function blockText(b: Block): string {
  switch (b.type) {
    case "p":
      return b.text;
    case "h2":
      return `\n## ${b.text}`;
    case "h3":
      return `### ${b.text}`;
    case "ul":
    case "ol":
      return b.items.map((x) => `- ${x}`).join("\n");
    case "quote":
      return `"${b.text}"${b.by ? ` (${b.by})` : ""}`;
    case "callout":
      return `${b.title}: ${b.text}`;
    case "turf":
      return `${b.rank ? `#${b.rank} ` : ""}${b.name}, ${b.area}${b.rating ? `, rated ${b.rating}` : ""}${b.reviews ? ` from ${b.reviews} reviews` : ""}${b.note ? `: ${b.note}` : ""}`;
    case "stat-grid":
      return b.items.map((i) => `${i.label}: ${i.value}${i.hint ? ` (${i.hint})` : ""}`).join("\n");
    case "table":
      return [b.caption ?? "", b.columns.join(" | "), ...b.rows.map((r) => r.join(" | "))].filter(Boolean).join("\n");
    case "faq":
      return b.items.map((i) => `Q: ${i.q}\nA: ${i.a}`).join("\n");
    // Buttons, turf card rows, the calculator, images and source links say nothing to summarise.
    default:
      return "";
  }
}

/** The article as the reader sees it, in plain text: title, deck, then the blocks in order. */
export function postText(post: Post): string {
  const body = post.blocks.map(blockText).filter(Boolean).join("\n");
  return `# ${post.title}\n${post.hook}\n${body}`.slice(0, MAX_TEXT);
}

/** Without the model: the article's own description and its section headings. */
export function outlineOf(post: Post): { gist: string; points: string[] } {
  const heads = post.blocks.filter((b): b is Extract<Block, { type: "h2" }> => b.type === "h2").map((b) => b.text.trim());
  return { gist: post.description, points: heads.filter((h) => !/^(faq|frequently asked|sources)/i.test(h)).slice(0, 6) };
}
