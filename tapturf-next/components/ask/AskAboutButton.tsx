"use client";

import { Sparkles } from "lucide-react";
import { useAsk } from "./AskProvider";

/**
 * In-page way into the chat on screens where the floating pill is
 * hidden because a fixed Call / Join bar owns the bottom edge.
 */
export function AskAboutButton({ label = "Ask about this turf" }: { label?: string }) {
  const { openPanel } = useAsk();
  return (
    <button
      type="button"
      onClick={() => openPanel()}
      className="press-tight inline-flex items-center gap-2 h-10 px-4 rounded-full bg-primary-900 text-white text-[14px] font-semibold hover:bg-accent-600 transition-colors cursor-pointer md:hidden"
    >
      <Sparkles className="w-4 h-4 text-accent-400" strokeWidth={2.25} />
      {label}
    </button>
  );
}
