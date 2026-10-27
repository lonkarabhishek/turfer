"use client";

import { Component, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import { reasonText, type Reason } from "@/lib/admin/section";

/**
 * Reads the admin page again (router.refresh): every section is read anew
 * and the ones that load replace their notes. The rest of the page stays
 * on screen meanwhile.
 */
export function RetryButton({ label = "Retry", className = "" }: { label?: string; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => router.refresh())}
      disabled={pending}
      className={`inline-flex items-center gap-1 rounded-full border border-primary-200 bg-white px-3 py-1 text-[12px] font-semibold text-primary-800 hover:bg-primary-50 disabled:opacity-60 ${className}`}
    >
      <RotateCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} aria-hidden />
      {pending ? "Retrying" : label}
    </button>
  );
}

/** A section that couldn't be read: why, and a retry. */
export function SectionError({ reason, what, className = "" }: { reason: Reason; what?: string; className?: string }) {
  const why = reason === "not_allowed" ? "Couldn't confirm it's you. Sign in with your Google account (the owner email), then retry." : `${reasonText(reason)}${what ? `: ${what}` : ""}.`;
  return (
    <div role="status" className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 ${className}`}>
      <p className="text-[13px] text-amber-900">{why}</p>
      <RetryButton />
    </div>
  );
}

/** A line under a group of tiles when some of them couldn't be read. */
export function SomeFailed({ count, className = "" }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <div role="status" className={`flex flex-wrap items-center justify-end gap-2 text-[12px] text-amber-800 ${className}`}>
      <span>
        {count === 1 ? "One number" : `${count} numbers`} couldn&rsquo;t load (shown as -).
      </span>
      <RetryButton />
    </div>
  );
}

/**
 * The last guard of one admin section: if it fails to render at all (a bug,
 * or a read that threw after all), only this section shows a note and a
 * retry; the rest of the page stays.
 */
type BoundaryProps = { title: string; children: ReactNode };
type BoundaryState = { failed: boolean; failedChildren: ReactNode };

export class SectionBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false, failedChildren: null };

  static getDerivedStateFromError(): Partial<BoundaryState> {
    return { failed: true };
  }

  // A retry (router.refresh) brings the section anew: new children, so it renders them again.
  static getDerivedStateFromProps(props: BoundaryProps, state: BoundaryState): Partial<BoundaryState> | null {
    return state.failed && state.failedChildren !== null && props.children !== state.failedChildren ? { failed: false, failedChildren: null } : null;
  }

  componentDidCatch(error: unknown) {
    console.error(`admin section "${this.props.title}" failed to render`, error);
    this.setState({ failedChildren: this.props.children });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="status" className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3">
        <p className="text-[13px] text-amber-900">{this.props.title} couldn&rsquo;t load.</p>
        <RetryButton />
      </div>
    );
  }
}

/** What a section shows while its numbers are read (nothing for one that is usually empty: height 0). */
export function SectionLoading({ title, height = 96 }: { title: string; height?: number }) {
  if (height === 0) return null;
  return (
    <div className="mb-8 rounded-2xl border border-primary-100 bg-primary-50/60 px-5 py-4 animate-pulse" style={{ minHeight: height }} aria-busy="true">
      <p className="text-xs font-bold text-primary-400">{title}</p>
      <p className="mt-2 text-[12px] text-primary-400">Loading</p>
    </div>
  );
}
