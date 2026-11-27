/**
 * The rule for anything a turf page adds to its body after it has loaded
 * (the page is cached and built ahead, so what is read in the browser is
 * never in its HTML): it may appear, change or go only while its place is
 * off the screen, so nothing the visitor is looking at moves. `show` runs
 * once, the first time the element is wholly off screen in a way that
 * moves nothing in view: below the screen, or above it where the browser
 * keeps the view still (scroll anchoring). While its place is on screen
 * nothing happens; it waits for the visitor to scroll on, or for the next
 * page. Free slots (FreeSlotsCard.tsx) and what is on at a turf
 * (TurfEventsCard.tsx) both wait this way.
 *
 * Returns the cleanup. Without IntersectionObserver nothing is shown.
 */
export function whenOffScreen(el: Element, show: () => void): () => void {
  if (typeof IntersectionObserver === "undefined") return () => {};
  const anchored = typeof CSS !== "undefined" && CSS.supports?.("overflow-anchor", "auto");
  const io = new IntersectionObserver((entries) => {
    const e = entries[entries.length - 1];
    if (!e || e.isIntersecting) return;
    const r = e.boundingClientRect;
    if (r.top >= window.innerHeight || (r.bottom <= 0 && anchored)) {
      io.disconnect();
      show();
    }
  });
  io.observe(el);
  return () => io.disconnect();
}
