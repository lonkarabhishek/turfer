"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { trackTool } from "@/lib/analytics/tools";

/** The one product button under a tool's result. */
export function ToolCta({ tool, label, href, className = "" }: { tool: string; label: string; href: string; className?: string }) {
  return (
    <div className={`mt-5 ${className}`}>
      <Link
        href={href}
        onClick={() => trackTool("tool_cta_clicked", tool, { href })}
        className="press-tight inline-flex w-full sm:w-auto items-center justify-center gap-2 h-12 px-6 rounded-full bg-primary-900 text-white text-[15px] font-semibold hover:bg-accent-600 transition-colors"
      >
        {label} <ArrowRight className="w-4 h-4" aria-hidden />
      </Link>
    </div>
  );
}
