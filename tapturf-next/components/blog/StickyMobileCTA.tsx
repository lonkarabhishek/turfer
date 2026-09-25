"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Per-article sticky CTA above the mobile bottom nav. Appears once the
 * reader is >30% through the article so it never blocks the hero, and
 * only on phones — desktop has the sidebar for this. Persists across
 * scroll but tucks behind the MobileNav (h-14 + safe-area).
 */
export function StickyMobileCTA({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const scrolled = doc.scrollTop / Math.max(1, doc.scrollHeight - doc.clientHeight);
      setVisible(scrolled > 0.3);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="md:hidden fixed left-0 right-0 z-40 px-4 pointer-events-none"
      style={{
        bottom: "calc(3.5rem + env(safe-area-inset-bottom) + 12px)",
      }}
    >
      <Link
        href={href}
        className="pointer-events-auto flex items-center justify-between gap-3 rounded-full bg-accent-500 hover:bg-accent-600 text-white font-bold text-sm px-5 py-3 shadow-neon transition-colors"
      >
        <span className="uppercase tracking-wide">{label}</span>
        <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}
