/**
 * Blog guard. Runs before every `next build` (see package.json), so a
 * post that would break the live site stops the deploy and production
 * keeps serving the last good build.
 *
 * Errors (exit 1, deploy stops) are only for things that break a page
 * or the sitemap and that the TypeScript check cannot see: impossible
 * dates, missing or unloadable images, duplicate or unsafe slugs, unsafe
 * link schemes. Everything else (house style, SEO and AEO habits, links
 * to pages that do not exist) is a warning: it prints, the post ships,
 * and we tweak it after.
 *
 * Style warnings only cover posts published or updated since
 * STYLE_SINCE, so the build log is about new work, not the archive.
 *
 * Run it yourself with `npm run check:blog`.
 */
import fs from "node:fs";
import path from "node:path";
import { ALL_POSTS, type Block, type Post } from "../content/blog";
import { BLOG_TURFS } from "../content/blog/data/turfs";
import { blogTurfHref, linksByRedirect } from "../content/blog/data/turfSlugs";
import { SPORT_PAGES } from "../lib/sports";
import { CITIES } from "../lib/city";
import { TOOLS } from "../lib/tools/registry";
import nextConfig from "../next.config";
import { BLOG_DESCRIPTION_MAX, BLOG_DESCRIPTION_MIN, blogSeoDescription, blogShareImage } from "../lib/seo/blogMeta";
import { TITLE_MAX_CHARS, TITLE_MAX_PX, textWidthPx } from "../lib/seo/width";

const STYLE_SINCE = "2026-10-19";
const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, "public");
const POSTS_DIR = path.join(ROOT, "content", "blog", "posts");

type Finding = { slug: string; level: "error" | "warn"; msg: string };
const findings: Finding[] = [];
const err = (slug: string, msg: string) => findings.push({ slug, level: "error", msg });
const warn = (slug: string, msg: string) => findings.push({ slug, level: "warn", msg });

// ---------------------------------------------------------------- helpers

/** A real calendar date in YYYY-MM-DD. "2026-02-30" and "20-10-2026" fail. */
function isRealDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const remotePatterns = (nextConfig.images?.remotePatterns ?? []) as { protocol?: string; hostname: string; pathname?: string }[];

/** Same rule next/image applies: unlisted hosts throw at render. */
function remoteAllowed(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  return remotePatterns.some((p) => {
    if (p.protocol && `${p.protocol}:` !== u.protocol) return false;
    const host = p.hostname.startsWith("**.")
      ? u.hostname.endsWith(p.hostname.slice(2))
      : p.hostname.startsWith("*.")
        ? u.hostname.split(".").slice(1).join(".") === p.hostname.slice(2)
        : u.hostname === p.hostname;
    if (!host) return false;
    const pat = p.pathname ?? "/**";
    return pat.endsWith("/**") ? u.pathname.startsWith(pat.slice(0, -3)) : u.pathname === pat;
  });
}

/** Images rendered by next/image: a file in public/ or an allowed host. */
function checkImage(slug: string, where: string, src: unknown) {
  if (typeof src !== "string" || !src.trim()) return err(slug, `${where}: image src is empty`);
  if (src.startsWith("/")) {
    const file = path.join(PUBLIC, decodeURIComponent(src.split(/[?#]/)[0]));
    if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file)) err(slug, `${where}: ${src} is not in public/`);
    return;
  }
  if (!/^https:\/\//.test(src)) return err(slug, `${where}: ${src} must start with / or https://`);
  if (!remoteAllowed(src))
    err(slug, `${where}: ${new URL(src).hostname} is not in next.config images.remotePatterns, the page would crash. Put the file in public/blog/art/ instead`);
}

const SPORTS = new Set(SPORT_PAGES.map((s) => s.slug));
const CITY_IDS = new Set(CITIES.map((c) => c.id));
const TOOL_SLUGS = new Set<string>(TOOLS.map((t) => t.slug));
const POST_SLUGS = new Set(ALL_POSTS.map((p) => p.slug));
const STATIC_ROUTES = new Set(["/", "/turfs", "/games", "/game/create", "/blog", "/tools", "/turf-near-me", "/privacy", "/terms", "/login", "/dashboard"]);
// next.config redirects still land somewhere real.
const REDIRECTED = new Set(["/turf-in-nashik", "/turf-in-pune", "/turf-in-mumbai", "/turf-in-nagpur", "/turf-in-hyderabad", "/turfs-near-me", "/near-me"]);

/** Whether an internal path resolves to a real page. */
function routeExists(href: string): boolean {
  const p = href.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (STATIC_ROUTES.has(p) || REDIRECTED.has(p)) return true;
  const seg = p.split("/").filter(Boolean);
  if (seg[0] === "blog" && seg.length === 2) return POST_SLUGS.has(seg[1]);
  if (seg[0] === "sport" && seg.length === 2) return SPORTS.has(seg[1]);
  if (seg[0] === "tools" && seg.length === 2) return TOOL_SLUGS.has(seg[1]);
  if ((seg[0] === "turf" || seg[0] === "game") && seg.length === 2) return true; // ids live in the database
  if (seg.length === 1) return CITY_IDS.has(seg[0]);
  if (seg.length === 2) return CITY_IDS.has(seg[0]) && SPORTS.has(seg[1]);
  return false;
}

/** cta links: internal paths, https, or mailto. Anything else is unsafe. */
function checkHref(slug: string, where: string, href: unknown, internal: string[]) {
  if (typeof href !== "string" || !href.trim()) return err(slug, `${where}: link is empty`);
  if (href.startsWith("/") && !href.startsWith("//")) {
    internal.push(href);
    if (!routeExists(href)) warn(slug, `${where}: ${href} is not a page on the site (404)`);
    return;
  }
  if (/^https?:\/\/(www\.)?tapturf\.in(\/|$)/.test(href)) {
    warn(slug, `${where}: write ${href} as a relative path like /turfs`);
    internal.push(href.replace(/^https?:\/\/(www\.)?tapturf\.in/, "") || "/");
    return;
  }
  if (/^https:\/\//.test(href) || /^mailto:/.test(href)) return;
  err(slug, `${where}: ${href} must be a /path, https:// or mailto: link`);
}

/** Every human-readable string in a post, for the style checks. */
function textsOf(post: Post): string[] {
  const out = [post.title, post.description, post.hook, post.heroImage?.alt ?? "", post.cta?.label ?? ""];
  for (const b of post.blocks) {
    switch (b.type) {
      case "p":
      case "h2":
      case "h3":
        out.push(b.text);
        break;
      case "ul":
      case "ol":
        out.push(...b.items);
        break;
      case "quote":
        out.push(b.text, b.by ?? "");
        break;
      case "callout":
        out.push(b.title, b.text);
        break;
      case "cta":
        out.push(b.text, b.label);
        break;
      case "turf":
        out.push(b.name, b.area, b.note ?? "");
        break;
      case "stat-grid":
        b.items.forEach((i) => out.push(i.value, i.label, i.hint ?? ""));
        break;
      case "table":
        out.push(b.caption ?? "", ...b.columns, ...b.rows.flat().map(String));
        break;
      case "faq":
        b.items.forEach((i) => out.push(i.q, i.a));
        break;
      case "related-turfs":
        out.push(b.title ?? "");
        break;
      case "price-calc":
        out.push(b.caption ?? "");
        break;
      case "image":
        out.push(b.alt, b.caption ?? "");
        break;
      case "sources":
        out.push(...b.items.map((i) => i.label), b.note ?? "");
        break;
    }
  }
  return out.filter(Boolean);
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---------------------------------------------------------------- checks

const today = new Date().toISOString().slice(0, 10);
const seenSlugs = new Map<string, number>();
const seenDescriptions = new Map<string, string>();

for (const post of ALL_POSTS) {
  const slug = post.slug || "(no slug)";

  // Identity and dates: these feed URLs, the sitemap and sorting.
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug ?? "")) err(slug, `slug must be lowercase words joined by hyphens`);
  seenSlugs.set(post.slug, (seenSlugs.get(post.slug) ?? 0) + 1);
  if (!isRealDate(post.publishedAt)) err(slug, `publishedAt "${post.publishedAt}" is not a real YYYY-MM-DD date (it would crash the sitemap)`);
  if (post.updatedAt !== undefined && !isRealDate(post.updatedAt)) err(slug, `updatedAt "${post.updatedAt}" is not a real YYYY-MM-DD date (it would crash the sitemap)`);
  for (const [k, v] of [["title", post.title], ["description", post.description], ["hook", post.hook]] as const) {
    if (typeof v !== "string" || !v.trim()) err(slug, `${k} is empty`);
  }
  if (!Number.isFinite(post.readMinutes) || post.readMinutes <= 0) err(slug, `readMinutes must be a positive number`);
  if (!Array.isArray(post.blocks) || post.blocks.length === 0) err(slug, `post has no blocks`);

  // What Google shows: the title (or seoTitle) whole on a phone and a
  // desktop, and a description it will not cut. Errors, for every post:
  // a cut title or snippet costs clicks on every search it shows for.
  const seoTitle = post.seoTitle ?? post.title;
  if (typeof seoTitle === "string" && (seoTitle.length > TITLE_MAX_CHARS || textWidthPx(seoTitle) > TITLE_MAX_PX))
    err(slug, `search title is ${seoTitle.length} characters, ${textWidthPx(seoTitle)}px; Google shows ${TITLE_MAX_CHARS} characters and about ${TITLE_MAX_PX}px. Add a shorter seoTitle`);
  const seoDescription = blogSeoDescription(post);
  if (typeof seoDescription === "string" && (seoDescription.length < BLOG_DESCRIPTION_MIN || seoDescription.length > BLOG_DESCRIPTION_MAX))
    err(slug, `search description is ${seoDescription.length} characters; keep it ${BLOG_DESCRIPTION_MIN} to ${BLOG_DESCRIPTION_MAX} (add or fix seoDescription)`);
  if (blogShareImage(post).generated) warn(slug, `no raster share image (heroImage.og, or a PNG or JPG hero), so links show the generated card`);
  if (post.heroImage && /^https?:\/\/lh\d+\.googleusercontent\.com\//i.test(post.heroImage.url))
    warn(slug, `hero is a Google Maps photo link, which expires; put a copy in public/blog/art/ (the share card is the generated one meanwhile)`);

  // Images go through next/image on the article, the blog index and the home page.
  if (post.heroImage) {
    checkImage(slug, "heroImage.url", post.heroImage.url);
    if (!post.heroImage.alt?.trim()) err(slug, `heroImage.alt is empty`);
  }

  const touched = (post.updatedAt ?? post.publishedAt) >= STYLE_SINCE;
  const internal: string[] = [];
  if (post.cta) checkHref(slug, "cta", post.cta.href, internal);

  const h2Ids = new Map<string, number>();
  post.blocks.forEach((b: Block, i) => {
    const at = `block ${i + 1} (${b.type})`;
    switch (b.type) {
      case "image":
        checkImage(slug, at, b.src);
        if (!b.alt?.trim()) err(slug, `${at}: alt is empty`);
        break;
      case "cta":
        checkHref(slug, at, b.href, internal);
        break;
      case "sources":
        if (!b.items.length) warn(slug, `${at}: sources list is empty`);
        b.items.forEach((item, j) => {
          if (!/^https:\/\/[^\s]+$/.test(item.url ?? "")) err(slug, `${at}: source ${j + 1} url must be a full https:// link`);
          if (!item.label?.trim()) warn(slug, `${at}: source ${j + 1} has no label`);
        });
        break;
      case "turf": {
        const href = blogTurfHref(b.id);
        if (href) internal.push(href);
        else warn(slug, `${at}: ${b.name} is no longer listed, so its card shows without a link`);
        if (linksByRedirect(b.id)) warn(slug, `${at}: turf id ${b.id} links through a redirect; add its slug to content/blog/data/turfSlugs.ts`);
        if (touched && !BLOG_TURFS[b.id]) warn(slug, `${at}: turf id ${b.id} is not in content/blog/data/turfs.ts, check it against the database`);
        break;
      }
      case "related-turfs": {
        const missing = b.ids.filter((id) => !BLOG_TURFS[id]);
        if (touched && missing.length) warn(slug, `${at}: ids not in content/blog/data/turfs.ts are skipped: ${missing.join(", ")}`);
        const shown = b.ids.filter((id) => BLOG_TURFS[id]);
        const gone = shown.filter((id) => blogTurfHref(id) === null);
        if (gone.length) warn(slug, `${at}: no longer listed, so left out of the cards: ${gone.map((id) => BLOG_TURFS[id].name).join(", ")}`);
        const unslugged = shown.filter(linksByRedirect);
        if (unslugged.length) warn(slug, `${at}: these link through a redirect; add their slugs to content/blog/data/turfSlugs.ts: ${unslugged.join(", ")}`);
        shown.forEach((id) => {
          const href = blogTurfHref(id);
          if (href) internal.push(href);
        });
        break;
      }
      case "faq":
        if (!b.items.length) warn(slug, `${at}: FAQ has no questions`);
        b.items.forEach((f, j) => {
          if (!f.q?.trim() || !f.a?.trim()) warn(slug, `${at}: FAQ item ${j + 1} has an empty question or answer`);
        });
        break;
      case "table":
        b.rows.forEach((r, j) => {
          if (r.length !== b.columns.length) warn(slug, `${at}: row ${j + 1} has ${r.length} cells for ${b.columns.length} columns`);
        });
        break;
      case "h2": {
        const id = b.id ?? slugify(b.text);
        h2Ids.set(id, (h2Ids.get(id) ?? 0) + 1);
        break;
      }
    }
  });
  for (const [id, n] of h2Ids) if (n > 1) warn(slug, `${n} headings share the anchor #${id}, give them distinct text or ids`);

  // House style, SEO and AEO: new and updated posts only.
  if (!touched) continue;
  // Compared as a string so this file does not depend on which categories exist yet.
  const category: string = post.category;
  const texts = textsOf(post);
  const all = texts.join("\n");

  const dashes = texts.filter((t) => t.includes("—"));
  if (dashes.length) warn(slug, `em dash (—) in ${dashes.length} place(s), use a comma, colon or full stop: "${dashes[0].slice(0, 60)}..."`);
  const hype = all.match(/\b(ultimate|game[- ]changer|unlock|revolutionary|skyrocket)\b/i);
  if (hype) warn(slug, `hype word "${hype[0]}", say it plainly`);
  if (post.title.length > 70) warn(slug, `title is ${post.title.length} characters, Google shows about 60`);
  if (post.description.length < 120 || post.description.length > 170) warn(slug, `description is ${post.description.length} characters, aim for 150 to 160`);
  const dupDesc = seenDescriptions.get(post.description);
  if (dupDesc) warn(slug, `description is the same as ${dupDesc}`);
  seenDescriptions.set(post.description, slug);
  if (!post.keywords?.length) warn(slug, `no keywords`);
  if (!post.blocks.some((b) => b.type === "faq")) warn(slug, `no FAQ block, so no FAQPage schema for answer engines`);
  if (post.blocks[0]?.type !== "p") warn(slug, `open with a paragraph that answers the question directly`);
  if (new Set(internal).size < 2) warn(slug, `only ${new Set(internal).size} internal link(s), add cta blocks to /turfs, /sport/..., /tools or another post`);
  if (post.publishedAt > today) warn(slug, `publishedAt ${post.publishedAt} is in the future, it will sit on top of /blog and the home page`);
  if (post.updatedAt && post.updatedAt < post.publishedAt) warn(slug, `updatedAt is before publishedAt`);

  if (post.heroImage?.url.endsWith(".svg") && !post.heroImage.og) warn(slug, `SVG hero has no og PNG, WhatsApp and X cannot show SVG`);
  if (post.heroImage?.og) {
    const og = post.heroImage.og;
    if (!/^https:\/\//.test(og)) warn(slug, `heroImage.og should be an absolute https URL`);
    const local = og.replace(/^https:\/\/(www\.)?tapturf\.in/, "");
    if (local.startsWith("/") && !fs.existsSync(path.join(PUBLIC, local))) warn(slug, `heroImage.og ${og} is not in public/`);
  }

  if (category === "News" && !post.blocks.some((b) => b.type === "sources" || ((b.type === "h2" || b.type === "h3") && /source/i.test(b.text))))
    warn(slug, `News post has no "Sources" heading, list where each fact came from`);
  if (category === "Fitness" && !/not medical advice/i.test(all))
    warn(slug, `Fitness post is missing the "not medical advice" line`);
  if (/\b(find|book|compare|search|discover|browse)\b[^.]{0,40}\bgyms?\b[^.]{0,40}\btap\s?turf\b|\btap\s?turf\b[^.]{0,40}\b(lists?|has|find|book|compare)\b[^.]{0,30}\bgyms?\b/i.test(all))
    warn(slug, `reads as if TapTurf lists gyms, it lists turfs, courts and games`);
}

for (const [slug, n] of seenSlugs) if (n > 1) err(slug, `slug is used by ${n} posts`);

// Files that exist but never made it into ALL_POSTS are not live.
const registered = new Set(ALL_POSTS.map((p) => p.slug));
for (const f of fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".ts"))) {
  const name = f.replace(/\.ts$/, "");
  if (!registered.has(name)) {
    const src = fs.readFileSync(path.join(POSTS_DIR, f), "utf8");
    const declared = src.match(/slug:\s*["'`]([^"'`]+)["'`]/)?.[1];
    if (declared && registered.has(declared)) warn(declared, `file is ${f}, rename it to ${declared}.ts so it matches the slug`);
    else warn(name, `${f} is not in ALL_POSTS (content/blog/index.ts), so it is not on the site`);
  }
}

// ---------------------------------------------------------------- report

const errors = findings.filter((f) => f.level === "error");
const warns = findings.filter((f) => f.level === "warn");
const bySlug = new Map<string, Finding[]>();
for (const f of findings) bySlug.set(f.slug, [...(bySlug.get(f.slug) ?? []), f]);
for (const [slug, list] of bySlug) {
  console.log(`\n${slug}`);
  for (const f of list) console.log(`  ${f.level === "error" ? "ERROR" : "warn "}  ${f.msg}`);
}
console.log(`\ncheck:blog ${ALL_POSTS.length} posts, ${errors.length} error(s), ${warns.length} warning(s)`);
if (errors.length) {
  console.log("Errors stop the deploy so the live site keeps the last good build. Fix them and push again.");
  process.exit(1);
}
