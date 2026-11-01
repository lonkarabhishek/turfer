"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle, Share2 } from "lucide-react";
import { Sheet } from "@/components/tools/scorer/ui";
import { trackTool } from "@/lib/analytics/tools";
import { shareText } from "@/lib/tournament/format";

/**
 * Share the tournament: WhatsApp with a message that names it and ends
 * with the link, copy the link, or the phone's own share sheet where
 * there is one. Anyone with the link can follow; nobody needs to sign in.
 */
export function ShareSheet({ name, url, onClose, tool }: { name: string; url: string; onClose: () => void; tool: string }) {
  const [copied, setCopied] = useState(false);
  const text = shareText(name, url);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      trackTool("tool_cta_clicked", tool, { href: "share", how: "copy" });
    } catch {
      setCopied(false);
    }
  };
  const native = async () => {
    trackTool("tool_cta_clicked", tool, { href: "share", how: "native" });
    try {
      await navigator.share({ text: text.slice(0, text.lastIndexOf("\n")), url });
    } catch {
      /* closed */
    }
  };
  return (
    <Sheet title="Share the tournament" subtitle="Anyone with the link can follow the table, the fixtures and live scores. No app or sign-in needed." onClose={onClose}>
      <div className="px-4 pt-3 space-y-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackTool("tool_cta_clicked", tool, { href: "share", how: "whatsapp" })}
          className="press-tight flex items-center justify-center gap-2 h-14 rounded-full bg-[#25D366] text-white text-[16px] font-bold"
        >
          <MessageCircle className="w-5 h-5" aria-hidden /> Send on WhatsApp
        </a>
        <button type="button" onClick={copy} className="press-tight w-full flex items-center justify-center gap-2 h-12 rounded-full border-2 border-primary-200 bg-white text-[15px] font-bold text-primary-800">
          {copied ? <Check className="w-4 h-4 text-accent-600" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />} {copied ? "Link copied" : "Copy link"}
        </button>
        {canShare && (
          <button type="button" onClick={native} className="press-tight w-full flex items-center justify-center gap-2 h-12 rounded-full text-[15px] font-semibold text-primary-700 hover:bg-primary-50">
            <Share2 className="w-4 h-4" aria-hidden /> More ways to share
          </button>
        )}
        <p className="pt-1 pb-2 text-center text-[12px] text-primary-500 break-all">{url.replace(/^https?:\/\/(www\.)?/, "")}</p>
        <span className="sr-only" aria-live="polite">
          {copied ? "Link copied" : ""}
        </span>
      </div>
    </Sheet>
  );
}
