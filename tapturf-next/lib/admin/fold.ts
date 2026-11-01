/**
 * Whether a folding section of the admin starts open. A section with
 * something waiting for the owner (claims to approve, removal requests,
 * suggestions) opens; otherwise its own default. The viewer's last choice
 * on this device wins, unless more is waiting now than when they made it:
 * then it opens again to show what is new. Pure; no "@/" imports (npm run
 * test:trend).
 */

/** What the browser keeps for one section: open or not, and how much was waiting then. */
export type FoldMemory = { open: boolean; waiting: number };

export const FOLD_KEY_PREFIX = "tt_admin_fold:";

export function foldDefault(defaultOpen: boolean, waiting: number): boolean {
  return waiting > 0 || defaultOpen;
}

export function foldOpen(defaultOpen: boolean, waiting: number, stored: FoldMemory | null): boolean {
  if (!stored || waiting > stored.waiting) return foldDefault(defaultOpen, waiting);
  return stored.open;
}

/** A stored choice, or null for anything else (nothing kept, another format, junk). */
export function readFoldMemory(raw: string | null): FoldMemory | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object") return null;
    const { open, waiting } = v as Record<string, unknown>;
    if (typeof open !== "boolean" || typeof waiting !== "number" || !Number.isFinite(waiting) || waiting < 0) return null;
    return { open, waiting: Math.floor(waiting) };
  } catch {
    return null;
  }
}

export const writeFoldMemory = (m: FoldMemory): string => JSON.stringify(m);
