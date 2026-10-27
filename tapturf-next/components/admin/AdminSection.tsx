import { Suspense, type ReactNode } from "react";
import { SectionBoundary, SectionLoading } from "./SectionStatus";

/**
 * One section of an admin page: it streams in when its own reads are done
 * (the rest of the page doesn't wait for it), and if it fails to render it
 * shows its own note and retry instead of taking the page down.
 */
export function AdminSection({ title, height, children }: { title: string; height?: number; children: ReactNode }) {
  return (
    <SectionBoundary title={title}>
      <Suspense fallback={<SectionLoading title={title} height={height} />}>{children}</Suspense>
    </SectionBoundary>
  );
}
