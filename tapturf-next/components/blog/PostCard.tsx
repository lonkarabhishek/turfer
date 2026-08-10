import Link from "next/link";
import type { Post } from "@/content/blog/types";

const CITY_LABEL: Record<string, string> = {
  nashik: "Nashik",
  pune: "Pune",
};

export function PostCard({ post, featured = false }: { post: Post; featured?: boolean }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className={`card-lift group block rounded-3xl border border-primary-200 bg-white overflow-hidden hover:border-primary-300 hover:shadow-elevated ${
        featured ? "md:col-span-2" : ""
      }`}
    >
      <div
        className={`bg-gradient-to-br from-accent-50 to-primary-50 flex items-center justify-center ${
          featured ? "h-56 md:h-72" : "h-44"
        }`}
      >
        <span className={`${featured ? "text-8xl md:text-9xl" : "text-6xl"} select-none`}>
          {post.coverEmoji}
        </span>
      </div>
      <div className="p-5 md:p-6">
        <div className="flex items-center gap-2 mb-3 text-[11px] uppercase font-bold tracking-widest">
          <span className="text-accent-600">{post.category}</span>
          {post.city && (
            <>
              <span className="text-primary-300">·</span>
              <span className="text-primary-500">{CITY_LABEL[post.city] || post.city}</span>
            </>
          )}
          <span className="text-primary-300">·</span>
          <span className="text-primary-500">{post.readMinutes} min read</span>
        </div>
        <h2
          className={`font-display uppercase tracking-wide text-primary-900 leading-tight mb-2 group-hover:text-accent-600 transition-colors ${
            featured ? "text-2xl md:text-3xl" : "text-xl"
          }`}
        >
          {post.title}
        </h2>
        <p className="text-primary-600 text-[15px] leading-snug">{post.hook}</p>
      </div>
    </Link>
  );
}
