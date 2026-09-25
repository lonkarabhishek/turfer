"use client";

import { useState } from "react";
import { Check, Link as LinkIcon, MessageCircle, Share2 } from "lucide-react";

export function ShareBar({ title, url }: { title: string; url: string }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    // Native share when available (mobile) — cleanest UX.
    const nav = navigator as Navigator & {
      share?: (data: { title?: string; url?: string; text?: string }) => Promise<void>;
    };
    if (nav.share) {
      try {
        await nav.share({ title, url });
        return;
      } catch {
        // user cancelled — fall through
      }
    }
    // Fallback: copy the link.
    copy();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore — clipboard blocked
    }
  };

  const waHref = `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`;

  return (
    <div className="not-prose flex flex-wrap items-center gap-2 my-8">
      <span className="text-[11px] font-semibold text-primary-400 mr-1">
        Share
      </span>
      <button
        onClick={share}
        className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 hover:border-accent-400 bg-white px-3 py-1.5 text-xs font-semibold text-primary-700 hover:text-accent-700 transition-colors"
      >
        <Share2 className="w-3.5 h-3.5" />
        Share
      </button>
      <a
        href={waHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 hover:border-emerald-500 bg-white px-3 py-1.5 text-xs font-semibold text-primary-700 hover:text-emerald-700 transition-colors"
      >
        <MessageCircle className="w-3.5 h-3.5" />
        WhatsApp
      </a>
      <button
        onClick={copy}
        className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 hover:border-accent-400 bg-white px-3 py-1.5 text-xs font-semibold text-primary-700 hover:text-accent-700 transition-colors"
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <LinkIcon className="w-3.5 h-3.5" />}
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
