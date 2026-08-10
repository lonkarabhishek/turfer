import type { Metadata } from "next";
import Link from "next/link";
import { getSortedPosts } from "@/content/blog";
import { PostCard } from "@/components/blog/PostCard";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "TapTurf Blog: Turf Guides, Rules & City Playbooks (Nashik + Pune)",
  description:
    "Guides, playbooks and honest reviews for cricket, football and box-cricket turfs across Nashik and Pune. Learn how to book smarter, host better, and play more.",
  keywords:
    "turf blog, cricket turf guide, football turf guide, box cricket rules, best turfs nashik, best turfs pune, turf booking guide, tapturf blog",
  openGraph: {
    title: "TapTurf Blog: Turf Guides for Nashik & Pune",
    description:
      "The playbook for booking, hosting and playing on sports turfs in Nashik and Pune.",
    url: "https://www.tapturf.in/blog",
    siteName: "TapTurf",
    type: "website",
    locale: "en_IN",
  },
  alternates: { canonical: "https://www.tapturf.in/blog" },
};

export default function BlogIndexPage() {
  const posts = getSortedPosts();
  const [featured, ...rest] = posts;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "TapTurf Blog",
    url: "https://www.tapturf.in/blog",
    description:
      "Turf guides, rules and playbooks for cricket, football and box-cricket across Nashik and Pune.",
    blogPost: posts.map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      description: p.description,
      url: `https://www.tapturf.in/blog/${p.slug}`,
      datePublished: p.publishedAt,
      dateModified: p.updatedAt || p.publishedAt,
      author: { "@type": "Organization", name: "TapTurf" },
    })),
  };

  const categories = Array.from(new Set(posts.map((p) => p.category)));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 md:py-14">
        {/* Hero */}
        <section className="mb-10 md:mb-14">
          <p className="text-xs font-bold uppercase tracking-widest text-accent-600 mb-3">
            The TapTurf Blog
          </p>
          <h1 className="font-display uppercase tracking-tight text-primary-900 text-4xl sm:text-5xl md:text-6xl leading-[0.95] mb-4">
            Play smarter.
            <br />
            <span className="text-accent-500">Book better.</span>
          </h1>
          <p className="text-primary-600 text-lg max-w-2xl leading-snug">
            Guides, playbooks and honest reviews for anyone who plays cricket,
            football or box cricket on the turfs of Nashik and Pune.
          </p>

          {/* Category chips */}
          <div className="mt-6 flex flex-wrap gap-2">
            {categories.map((c) => (
              <span
                key={c}
                className="text-[11px] font-bold uppercase tracking-widest text-primary-700 bg-primary-100 rounded-full px-3 py-1.5"
              >
                {c}
              </span>
            ))}
          </div>
        </section>

        {/* Featured + grid */}
        {featured && (
          <div className="mb-8">
            <PostCard post={featured} featured />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rest.map((post) => (
            <PostCard key={post.slug} post={post} />
          ))}
        </div>

        {/* Nudge back to the app */}
        <section className="mt-14 rounded-3xl bg-gradient-to-br from-primary-900 to-primary-800 text-white p-8 md:p-10 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-accent-400 mb-3">
            Ready to play?
          </p>
          <h2 className="font-display uppercase text-3xl md:text-4xl leading-tight mb-3">
            Every turf in Nashik & Pune,
            <br />
            one search.
          </h2>
          <Link
            href="/turfs"
            className="inline-block mt-4 rounded-full bg-accent-500 hover:bg-accent-400 text-white font-bold uppercase tracking-wide text-sm px-6 py-3 shadow-neon transition-colors"
          >
            Browse turfs
          </Link>
        </section>
      </div>
    </>
  );
}
