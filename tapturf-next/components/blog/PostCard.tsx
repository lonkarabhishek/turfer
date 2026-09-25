import Link from "next/link";
import type { Post } from "@/content/blog/types";

const CITY_LABEL: Record<string, string> = {
  nashik: "Nashik",
  pune: "Pune",
  mumbai: "Mumbai",
};

export function PostCard({ post, featured = false }: { post: Post; featured?: boolean }) {
  const hasImage = !!post.heroImage;
  return (
    <Link
      href={`/blog/${post.slug}`}
      className={`card-lift group block rounded-3xl border border-primary-200 bg-white overflow-hidden hover:border-primary-300 hover:shadow-elevated ${
        featured ? "md:col-span-2" : ""
      }`}
    >
      <div
        className={`relative overflow-hidden ${
          featured ? "h-56 md:h-72" : "h-44"
        } ${hasImage ? "bg-primary-100" : "bg-gradient-to-br from-accent-50 to-primary-50"}`}
      >
        {hasImage ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.heroImage!.url}
              alt={post.heroImage!.alt}
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
            <span
              className={`absolute right-4 bottom-4 select-none drop-shadow-lg ${featured ? "text-5xl" : "text-3xl"}`}
              aria-hidden
            >
              {post.coverEmoji}
            </span>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className={`${featured ? "text-8xl md:text-9xl" : "text-6xl"} select-none`}>
              {post.coverEmoji}
            </span>
          </div>
        )}
      </div>
      <div className="p-5 md:p-6">
        <div className="flex items-center gap-2 mb-3 text-[11px] font-bold">
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
          className={`font-display text-primary-900 leading-tight mb-2 group-hover:text-accent-600 transition-colors ${
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
