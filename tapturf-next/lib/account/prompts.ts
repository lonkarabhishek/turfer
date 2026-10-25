/**
 * The one-time asks after sign-in (a username, an email): where and when
 * they may open. At most one opens per visit, so nobody gets two sheets in
 * a row.
 */

/** Browsing pages only: never mid sign-in, mid game creation or on the scoring tools. */
export function askHere(path: string): boolean {
  if (path === "/" || path === "/dashboard" || path === "/turfs" || path === "/games") return true;
  if (path.startsWith("/c/") || path.startsWith("/turf/")) return true;
  return /^\/game\/[^/]+$/.test(path) && path !== "/game/create";
}

/** Something else has the person's attention: another dialog, or a field they are typing in. */
export function busy(): boolean {
  if (document.querySelector('[aria-modal="true"], [role="dialog"], [role="alertdialog"]')) return true;
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

export const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const VISIT_KEY = "tt_prompt_visit";
let claimedHere: string | null = null;

/** Whether an ask already opened in this visit (this tab's session). */
export function promptedThisVisit(): boolean {
  if (claimedHere) return true;
  try {
    return !!sessionStorage.getItem(VISIT_KEY);
  } catch {
    return false;
  }
}

/** Take this visit's one ask for `which`; false when another ask already had it. */
export function claimPrompt(which: "username" | "email"): boolean {
  if (claimedHere) return claimedHere === which;
  try {
    const had = sessionStorage.getItem(VISIT_KEY);
    if (had && had !== which) return false;
    sessionStorage.setItem(VISIT_KEY, which);
  } catch {
    /* storage blocked: this tab's flag still holds */
  }
  claimedHere = which;
  return true;
}
