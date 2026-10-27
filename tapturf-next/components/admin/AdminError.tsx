"use client";

import { useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * The last guard of an admin page (its error.tsx): every read there is
 * already settled and each section has its own boundary, so this shows only
 * for a page that fails to render at all. It keeps the owner in admin with a
 * retry, instead of the site's "This page is taking a break".
 */
export function AdminError({ error, reset, where = "This admin page" }: { error: Error & { digest?: string }; reset: () => void; where?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  useEffect(() => {
    console.error("admin page failed", error.digest ?? "", error);
  }, [error]);
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
      <p className="text-xs font-bold text-accent-600 mb-2">Owner only</p>
      <h1 className="font-display text-3xl text-primary-900 mb-2">{where} couldn&rsquo;t load</h1>
      <p className="text-primary-600 text-sm mb-6">
        The database may be busy. Try again in a moment.
        {error.digest ? <span className="block mt-1 font-mono text-[12px] text-primary-400">Ref {error.digest}</span> : null}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(() => {
              router.refresh();
              reset();
            })
          }
          className="rounded-full bg-primary-900 text-white text-sm font-bold px-5 py-2.5 hover:bg-primary-800 disabled:opacity-60"
        >
          {pending ? "Retrying" : "Retry"}
        </button>
        <Link href="/admin" className="rounded-full border border-primary-200 text-primary-800 text-sm font-bold px-5 py-2.5 hover:bg-primary-50">
          Admin home
        </Link>
      </div>
    </div>
  );
}
