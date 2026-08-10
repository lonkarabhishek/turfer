import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  ALL_POSTS,
  getPostBySlug,
  getRelatedPosts,
  getAllSlugs,
} from "@/content/blog";
import { BlockRenderer } from "@/components/blog/BlockRenderer";
import { PostCard } from "@/components/blog/PostCard";

export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

const CITY_LABEL: Record<string, string> = { nashik: "Nashik", pune: "Pune" };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) {
    return { title: "Post not found | TapTurf Blog" };
  }

  const url = `https://www.tapturf.in/blog/${post.slug}`;
  return {
    title: `${post.title} | TapTurf Blog`,
    description: post.description,
    keywords: post.keywords.join(", "),
    openGraph: {
      title: post.title,
      description: post.description,
      url,
      siteName: "TapTurf",
      type: "article",
      locale: "en_IN",
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt || post.publishedAt,
      tags: post.keywords,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
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

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    url: `https://www.tapturf.in/blog/${post.slug}`,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt || post.publishedAt,
    author: {
      "@type": "Organization",
      name: "TapTurf",
      url: "https://www.tapturf.in",
    },
    publisher: {
      "@type": "Organization",
      name: "TapTurf",
      logo: {
        "@type": "ImageObject",
        url: "https://www.tapturf.in/icon-512.png",
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://www.tapturf.in/blog/${post.slug}`,
    },
    keywords: post.keywords.join(", "),
    articleSection: post.category,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <article className="max-w-3xl mx-auto px-4 sm:px-6 py-8 md:py-12">
        <Link
          href="/blog"
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary-500 hover:text-accent-600 mb-6"
        >
          <ChevronLeft className="w-4 h-4" />
          All articles
        </Link>

        {/* Meta chips */}
        <div className="flex items-center gap-2 mb-4 text-[11px] uppercase font-bold tracking-widest">
          <span className="text-accent-600">{post.category}</span>
          {post.city && (
            <>
              <span className="text-primary-300">·</span>
              <span className="text-primary-500">
                {CITY_LABEL[post.city] || post.city}
              </span>
            </>
          )}
          <span className="text-primary-300">·</span>
          <span className="text-primary-500">{post.readMinutes} min read</span>
        </div>

        {/* Title + hero */}
        <h1 className="font-display uppercase tracking-tight text-primary-900 text-3xl sm:text-4xl md:text-5xl leading-[1.05] mb-4">
          {post.title}
        </h1>
        <p className="text-primary-600 text-lg leading-snug mb-8">{post.hook}</p>

        <div className="w-full h-48 md:h-64 rounded-3xl bg-gradient-to-br from-accent-50 to-primary-50 flex items-center justify-center mb-10">
          <span className="text-8xl md:text-9xl select-none">
            {post.coverEmoji}
          </span>
        </div>

        {/* Body */}
        <div className="prose-tapturf">
          {post.blocks.map((block, i) => (
            <BlockRenderer key={i} block={block} />
          ))}
        </div>

        {/* Byline */}
        <div className="mt-12 pt-6 border-t border-primary-200 flex items-center justify-between text-sm text-primary-500">
          <div>
            Published{" "}
            <time dateTime={post.publishedAt}>
              {new Date(post.publishedAt).toLocaleDateString("en-IN", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
          </div>
          <div className="font-semibold uppercase tracking-wide text-primary-700">
            The TapTurf team
          </div>
        </div>
      </article>

      {/* Related */}
      {related.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-14">
          <div className="section-divider mb-8" />
          <h2 className="font-display uppercase tracking-wide text-primary-900 text-2xl md:text-3xl mb-6">
            Keep reading
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {related.map((p) => (
              <PostCard key={p.slug} post={p} />
            ))}
          </div>
        </section>
      )}

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
