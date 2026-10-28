/**
 * Search title, description and share image for a blog post.
 *
 * Share image, in order: heroImage.og (a raster made for cards), else a
 * raster hero, else the post's generated card (/api/og/blog/<slug>,
 * 1200x630). Google Maps photos (lh3.googleusercontent.com) are never a
 * post's share image: their links expire and the photo is not ours.
 * No opengraph-image.tsx file convention: it would replace the good heroes.
 *
 * Pure (type imports only), so the blog check (scripts/check-blog.ts)
 * and node --test use it.
 */
import type { Post } from "../../content/blog/types";
import { titleFits, withBrand } from "./width";

const SITE = "https://www.tapturf.in";

export const BLOG_DESCRIPTION_MIN = 110;
export const BLOG_DESCRIPTION_MAX = 155;

/** The title Google shows: seoTitle or title, with " | TapTurf" only if the whole still fits. */
export function blogSeoTitle(post: Pick<Post, "title" | "seoTitle">): string {
  const base = post.seoTitle ?? post.title;
  return titleFits(base) ? withBrand(base) : base;
}

export function blogSeoDescription(post: Pick<Post, "description" | "seoDescription">): string {
  return post.seoDescription ?? post.description;
}

const absolute = (u: string) => (u.startsWith("/") ? `${SITE}${u}` : u);
/** PNG, JPEG or WebP, from our site or another host that is not Google's photo CDN. */
export function isRasterShareImage(url: string | null | undefined): boolean {
  if (!url) return false;
  if (/^https?:\/\/lh\d+\.googleusercontent\.com\//i.test(url)) return false;
  return /\.(png|jpe?g|webp)(?:[?#].*)?$/i.test(url);
}

/** The generated card for a post. */
export function blogCardUrl(slug: string): string {
  return `${SITE}/api/og/blog/${slug}`;
}

/**
 * The share image and its size when we know it (the generated card is
 * 1200x630; hero PNGs vary, 1200x675 and up, so no size is claimed).
 */
export function blogShareImage(post: Pick<Post, "slug" | "title" | "heroImage">): {
  url: string;
  alt: string;
  width?: number;
  height?: number;
  generated: boolean;
} {
  const hero = post.heroImage;
  const alt = hero?.alt || post.title;
  if (hero?.og && isRasterShareImage(hero.og)) return { url: absolute(hero.og), alt, generated: false };
  if (hero && isRasterShareImage(hero.url)) return { url: absolute(hero.url), alt, generated: false };
  return { url: blogCardUrl(post.slug), alt: post.title, width: 1200, height: 630, generated: true };
}
