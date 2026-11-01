"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { FOLD_KEY_PREFIX, foldDefault, foldOpen, readFoldMemory, writeFoldMemory, type FoldMemory } from "@/lib/admin/fold";

/**
 * One folding section of the admin, a native <details>: it opens and
 * closes without JavaScript, and its summary row (the title, one line of
 * what is in it, and how much waits for the owner) says something while
 * closed. It starts open when something waits; with JavaScript it also
 * remembers the viewer's last choice on this device (lib/admin/fold.ts)
 * and opens for a link to something inside it (/admin#owner-claims). A
 * client part inside can update the line and the count once it has read
 * its own rows (useFoldReport).
 */

/** What a client part inside a fold says once it has its rows: a new line, how much waits. */
export type FoldReport = { line?: string; waiting?: number };

const ReportContext = createContext<((r: FoldReport) => void) | null>(null);

/** The fold around this part (null outside one). */
export const useFoldReport = () => useContext(ReportContext);

const readMemory = (key: string): FoldMemory | null => {
  try {
    return readFoldMemory(window.localStorage.getItem(key));
  } catch {
    return null;
  }
};

export function Fold({
  id,
  title,
  line,
  waiting = 0,
  defaultOpen = false,
  openWide = false,
  inner = false,
  children,
}: {
  /** The anchor (/admin#id) and where the choice is kept. */
  id: string;
  title: string;
  /** One line of what is in it, shown while closed. */
  line?: string | null;
  /** How much waits for the owner: a chip in the summary, and the section opens. */
  waiting?: number;
  defaultOpen?: boolean;
  /** Also open by default on a screen 768 px or wider (once the page has loaded): the sign-ups chart, closed on a phone. */
  openWide?: boolean;
  /** A fold inside a section's card (the sign-ups chart): a lighter row. */
  inner?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  // What the server drew; never changed after, so a re-render doesn't undo the viewer's choice.
  const [initial] = useState(() => foldDefault(defaultOpen, waiting));
  const [report, setReport] = useState<FoldReport | null>(null);
  const touched = useRef(false);
  const key = FOLD_KEY_PREFIX + id;
  const shownWaiting = report?.waiting ?? waiting;
  const shownLine = report?.line ?? line;

  // The server's numbers, for the choice kept here: a later report opens it (below), never closes it.
  const server = useRef({ defaultOpen, waiting, openWide });

  // After hydration: a link to something inside opens it; else the viewer's last choice here.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const targetInside = () => {
      const hash = window.location.hash.slice(1);
      try {
        const t = hash ? document.getElementById(decodeURIComponent(hash)) : null;
        return t && el.contains(t) ? t : null;
      } catch {
        return null;
      }
    };
    const reveal = () => {
      const t = targetInside();
      if (!t) return false;
      if (!el.open) {
        el.open = true;
        requestAnimationFrame(() => t.scrollIntoView({ block: "start" }));
      }
      return true;
    };
    if (!reveal()) {
      const { defaultOpen, waiting, openWide } = server.current;
      const stored = readMemory(key);
      el.open = !stored && openWide && window.matchMedia("(min-width: 768px)").matches ? true : foldOpen(defaultOpen, waiting, stored);
    }
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, [key]);

  // A part inside counted something waiting: open, unless the viewer chose here already.
  useEffect(() => {
    const el = ref.current;
    if (!el || touched.current || report?.waiting === undefined) return;
    if (foldOpen(defaultOpen, report.waiting, readMemory(key))) el.open = true;
  }, [report, defaultOpen, key]);

  // A choice the viewer makes (a tap, or Enter or Space on the summary), kept for next time.
  const remember = () => {
    const el = ref.current;
    if (!el) return;
    touched.current = true;
    try {
      window.localStorage.setItem(key, writeFoldMemory({ open: !el.open, waiting: shownWaiting }));
    } catch {
      // Private window or storage off: the page works the same, it just doesn't remember.
    }
  };

  const chip =
    shownWaiting > 0 ? (
      <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[12px] font-bold text-amber-900 tabular-nums">{shownWaiting.toLocaleString("en-IN")} waiting</span>
    ) : null;

  if (inner) {
    return (
      <details ref={ref} id={id} open={initial} className="group/sub scroll-mt-20">
        <summary
          onClick={remember}
          className="flex min-h-11 cursor-pointer select-none list-none items-center gap-3 rounded-xl bg-primary-50 px-3 py-2 outline-none hover:bg-primary-100 focus-visible:ring-2 focus-visible:ring-accent-500/40 [&::-webkit-details-marker]:hidden"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold text-primary-900">{title}</span>
            {shownLine && <span className="block text-[12px] text-primary-500">{shownLine}</span>}
          </span>
          {chip}
          <ChevronDown className="h-5 w-5 shrink-0 text-primary-400 transition-transform group-open/sub:rotate-180" aria-hidden />
        </summary>
        <ReportContext.Provider value={setReport}>
          <div className="pt-3">{children}</div>
        </ReportContext.Provider>
      </details>
    );
  }

  return (
    <details ref={ref} id={id} open={initial} className="group/fold mb-3 scroll-mt-20">
      <summary
        onClick={remember}
        className="flex min-h-14 cursor-pointer select-none list-none items-center gap-3 rounded-2xl border border-primary-200 bg-white px-4 py-2.5 outline-none transition-colors hover:bg-primary-50 focus-visible:ring-2 focus-visible:ring-accent-500/40 group-open/fold:bg-primary-50 [&::-webkit-details-marker]:hidden"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold leading-snug text-primary-900">{title}</span>
          {shownLine && <span className="block text-[13px] leading-snug text-primary-500">{shownLine}</span>}
        </span>
        {chip}
        <ChevronDown className="h-5 w-5 shrink-0 text-primary-400 transition-transform group-open/fold:rotate-180" aria-hidden />
      </summary>
      <ReportContext.Provider value={setReport}>
        {/* A section's own bottom margin would double the gap under the fold. */}
        <div className="pt-3 pb-5 *:last:mb-0">{children}</div>
      </ReportContext.Provider>
    </details>
  );
}
