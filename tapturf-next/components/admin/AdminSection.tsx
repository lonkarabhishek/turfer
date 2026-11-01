import { Suspense, type ReactNode } from "react";
import { SectionBoundary, SectionLoading } from "./SectionStatus";
import { Fold } from "./Fold";

/** What a folding section's summary row says while closed (null: the section has nothing to show, so no row either). */
export type FoldSummary = { line: string; waiting?: number } | null;

/**
 * One section of an admin page: it streams in when its own reads are done
 * (the rest of the page doesn't wait for it), and if it fails to render it
 * shows its own note and retry instead of taking the page down. With an id
 * and a summary it folds (components/admin/Fold.tsx): the summary is read
 * with the section's own reads (each made once per render), so its line
 * and waiting count arrive with the section.
 */
export function AdminSection({
  id,
  title,
  height,
  summary,
  open = false,
  children,
}: {
  id?: string;
  title: string;
  height?: number;
  summary?: () => Promise<FoldSummary>;
  /** Open by default (it also opens whenever something waits). */
  open?: boolean;
  children: ReactNode;
}) {
  const folded = id !== undefined && summary !== undefined;
  return (
    <SectionBoundary title={title}>
      {/* A section that is usually empty (height 0) shows nothing while it loads, folded or not. */}
      <Suspense fallback={<SectionLoading title={title} height={height === 0 ? 0 : folded && !open ? 56 : height} folded={folded} />}>
        {folded ? (
          <Folded id={id} title={title} summary={summary} open={open}>
            {children}
          </Folded>
        ) : (
          children
        )}
      </Suspense>
    </SectionBoundary>
  );
}

async function Folded({ id, title, summary, open, children }: { id: string; title: string; summary: () => Promise<FoldSummary>; open: boolean; children: ReactNode }) {
  const s = await summary();
  if (!s) return null;
  return (
    <Fold id={id} title={title} line={s.line} waiting={s.waiting} defaultOpen={open}>
      {children}
    </Fold>
  );
}
