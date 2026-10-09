"use client";

import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useAsk } from "./AskProvider";

/**
 * Floating "Ask" pill, bottom right on every page. Sits above the
 * mobile nav on phones. Hidden while the panel is open and on admin
 * and login pages.
 */
export function AskLauncher() {
  const { open, openPanel, turns } = useAsk();
  const pathname = usePathname();
  if (open || pathname.startsWith("/admin") || pathname.startsWith("/login")) return null;
  const count = turns.filter((t) => t.res).length;
  return (
    <button
      type="button"
      onClick={() => openPanel()}
      aria-label="Ask TapTurf"
      className="press-tight fixed right-4 bottom-[4.75rem] md:right-6 md:bottom-6 z-30 inline-flex items-center gap-2 h-12 pl-3.5 pr-4 rounded-full bg-primary-900 text-white shadow-elevated hover:bg-accent-600 transition-colors cursor-pointer"
    >
      <span className="relative inline-flex">
        <Sparkles className="w-5 h-5 text-accent-400" strokeWidth={2.25} />
        {count > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-accent-400 ring-2 ring-primary-900" aria-hidden />}
      </span>
      <span className="text-[14px] font-semibold">Ask</span>
    </button>
  );
}
