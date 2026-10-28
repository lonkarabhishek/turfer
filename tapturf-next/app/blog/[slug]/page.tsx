import type { Metadata } from "next";
import { CONTACT_EMAIL } from "@/lib/contact";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  ALL_POSTS,
  getPostBySlug,
  getRelatedPosts,
  getAllSlugs,
} from "@/content/blog";
import { BlockRenderer } from "@/components/blog/BlockRenderer";
import { PostCard } from "@/components/blog/PostCard";
import { TableOfContents } from "@/components/blog/TableOfContents";
import { ShareBar } from "@/components/blog/ShareBar";
import { StickyMobileCTA } from "@/components/blog/StickyMobileCTA";
import { AskPageContext } from "@/components/ask/AskPageContext";
import { labelFor } from "@/lib/city";
import { blogSeoDescription, blogSeoTitle, blogShareImage } from "@/lib/seo/blogMeta";
import { OG_BASE, ROBOTS_NOINDEX_FOLLOW, TWITTER_CARD } from "@/lib/seo/defaults";
import { jsonLdHtml } from "@/lib/seo/jsonLd";

export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) {
    return { title: "Post not found", robots: ROBOTS_NOINDEX_FOLLOW };
  }

  const url = `https://www.tapturf.in/blog/${post.slug}`;
  // seoTitle when the H1 is too long for a result, " | TapTurf" only if it
  // fits; the share image is never missing (lib/seo/blogMeta.ts).
  const title = blogSeoTitle(post);
  const description = blogSeoDescription(post);
  const image = blogShareImage(post);
  const ogImage = { url: image.url, alt: image.alt, ...(image.width && image.height && { width: image.width, height: image.height }) };
  return {
    title: { absolute: title },
    description,
    keywords: post.keywords.join(", "),
    openGraph: {
      ...OG_BASE,
      title,
      description,
      url,
      type: "article",
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt || post.publishedAt,
      tags: post.keywords,
      images: [ogImage],
    },
    twitter: {
      ...TWITTER_CARD,
      title,
      description,
      images: [ogImage.url],
    },
    alternates: { canonical: url },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const related = getRelatedPosts(post.slug, 3);
  const url = `https://www.tapturf.in/blog/${post.slug}`;

  // BlogPosting JSON-LD.
  const blogJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    url,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt || post.publishedAt,
    // Always an image: the card made for sharing, a raster hero, or the
    // generated 1200x630 card (never an expiring Google Maps photo).
    image: (() => {
      const img = blogShareImage(post);
      return { "@type": "ImageObject", url: img.url, ...(img.width && img.height && { width: img.width, height: img.height }) };
    })(),
    author: {
      "@type": "Organization",
      name: "TapTurf",
      url: "https://www.tapturf.in",
    },
    publisher: {
      "@type": "Organization",
      name: "TapTurf",
      url: "https://www.tapturf.in",
      email: CONTACT_EMAIL,
      areaServed: { "@type": "Country", name: "India" },
      logo: {
        "@type": "ImageObject",
        url: "https://www.tapturf.in/icon-512.png",
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
    },
    keywords: post.keywords.join(", "),
    articleSection: post.category,
  };

  // BreadcrumbList JSON-LD.
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://www.tapturf.in" },
      { "@type": "ListItem", position: 2, name: "Blog", item: "https://www.tapturf.in/blog" },
      { "@type": "ListItem", position: 3, name: post.title, item: url },
    ],
  };

  // FAQPage JSON-LD — emitted only when the article actually has a FAQ
  // block on the page (per Google's rule that structured data must
  // match visible content).
  const faqBlock = post.blocks.find((b) => b.type === "faq") as
    | (Extract<import("@/content/blog").Block, { type: "faq" }>)
    | undefined;
  const faqJsonLd = faqBlock && faqBlock.items.length > 0
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqBlock.items.map((qa) => ({
          "@type": "Question",
          name: qa.q,
          acceptedAnswer: { "@type": "Answer", text: qa.a },
        })),
      }
    : null;

  // Ask's opening offers on this article: a few of its own FAQ questions,
  // and "Chart the key numbers" only when it has numbers to chart.
  const askQuestions = (faqBlock?.items ?? []).map((qa) => qa.q.trim()).filter(Boolean).slice(0, 3);
  const askCharts =
    post.blocks.some((b) => b.type === "table" || b.type === "stat-grid") ||
    post.blocks.filter((b) => b.type === "turf").length >= 2;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(blogJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(breadcrumbJsonLd) }}
      />
      {faqJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdHtml(faqJsonLd) }}
        />
      )}

      <article className="max-w-3xl mx-auto px-4 sm:px-6 py-8 md:py-12">
        {/* Breadcrumb — visible + crawlable */}
        <nav
          aria-label="Breadcrumb"
          className="text-xs text-primary-400 mb-6 flex items-center gap-1.5 overflow-x-auto scrollbar-hide"
        >
          <Link href="/" className="hover:text-primary-700 whitespace-nowrap">Home</Link>
          <ChevronRight className="w-3 h-3 shrink-0" />
          <Link href="/blog" className="hover:text-primary-700 whitespace-nowrap inline-flex items-center gap-1">
            <ChevronLeft className="w-3 h-3" /> Blog
          </Link>
          <ChevronRight className="w-3 h-3 shrink-0" />
          <span className="text-primary-700 truncate">{post.title}</span>
        </nav>

        {/* Meta chips */}
        <div className="flex items-center gap-2 mb-4 text-[11px] font-bold">
          <span className="text-accent-600">{post.category}</span>
          {post.city && (
            <>
              <span className="text-primary-300">·</span>
              <span className="text-primary-500">{labelFor(post.city)}</span>
            </>
          )}
          <span className="text-primary-300">·</span>
          <span className="text-primary-500">{post.readMinutes} min read</span>
          <span className="text-primary-300">·</span>
          <time className="text-primary-500" dateTime={post.updatedAt || post.publishedAt}>
            {new Date(post.updatedAt || post.publishedAt).toLocaleDateString("en-IN", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </time>
        </div>

        {/* Title + deck */}
        <h1 className="font-display tracking-tight text-primary-900 text-3xl sm:text-4xl md:text-5xl leading-[1.05] mb-4">
          {post.title}
        </h1>
        <p className="text-primary-600 text-lg leading-snug mb-8">{post.hook}</p>

        {/* Hero image — Next Image with priority for LCP. Falls back
            to the gradient + emoji card when no photo is provided. */}
        {post.heroImage ? (
          <figure className="mb-10">
            <div className="relative w-full aspect-[16/9] rounded-3xl overflow-hidden bg-primary-100">
              <Image
                src={post.heroImage.url}
                alt={post.heroImage.alt}
                fill
                priority
                sizes="(max-width: 768px) 100vw, 800px"
                className="object-cover"
                unoptimized={post.heroImage.url.endsWith(".svg")}
              />
            </div>
            {post.heroImage.credit && (
              <figcaption className="mt-2 text-[11px] text-primary-400">
                {post.heroImage.credit}
              </figcaption>
            )}
          </figure>
        ) : (
          <div className="w-full h-48 md:h-64 rounded-3xl bg-gradient-to-br from-accent-50 to-primary-50 flex items-center justify-center mb-10">
            <span className="text-8xl md:text-9xl select-none">{post.coverEmoji}</span>
          </div>
        )}

        {/* Table of contents (renders only if ≥3 h2s) */}
        <TableOfContents blocks={post.blocks} />

        {/* Body */}
        <div className="prose-tapturf">
          {post.blocks.map((block, i) => (
            <BlockRenderer key={i} block={block} />
          ))}
        </div>

        {/* Share */}
        <ShareBar title={post.title} url={url} />

        {/* Byline */}
        <div className="mt-8 pt-6 border-t border-primary-200 flex items-center justify-between text-sm text-primary-500">
          <div>
            Published{" "}
            <time dateTime={post.publishedAt}>
              {new Date(post.publishedAt).toLocaleDateString("en-IN", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
            {post.updatedAt && post.updatedAt !== post.publishedAt && (
              <>
                {" · updated "}
                <time dateTime={post.updatedAt}>
                  {new Date(post.updatedAt).toLocaleDateString("en-IN", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </time>
              </>
            )}
          </div>
          <div className="font-semibold text-primary-700">
            The TapTurf team
          </div>
        </div>
      </article>

      {/* Related — "Keep playing" */}
      {related.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-14">
          <div className="section-divider mb-8" />
          <h2 className="font-display text-primary-900 text-2xl md:text-3xl mb-6">
            Keep playing
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {related.map((p) => (
              <PostCard key={p.slug} post={p} />
            ))}
          </div>
        </section>
      )}

      {/* Ask knows the article, so it can offer the short version and questions about it. */}
      <AskPageContext blog={{ slug: post.slug, title: post.title, questions: askQuestions, charts: askCharts }} city={post.city} />

      {/* Sticky mobile CTA — only on articles that declare one */}
      {post.cta && <StickyMobileCTA href={post.cta.href} label={post.cta.label} />}

      {/* Full sr-only list for crawlers */}
      <ul className="sr-only" aria-hidden="false">
        {ALL_POSTS.map((p) => (
          <li key={p.slug}>
            <Link href={`/blog/${p.slug}`}>{p.title}</Link>
          </li>
        ))}
      </ul>
    </>
  );
}
