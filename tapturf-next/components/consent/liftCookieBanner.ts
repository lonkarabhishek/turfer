/**
 * Keeps the cookie banner (CookieBanner.tsx) clear of a fixed bar that
 * sits over the phone's bottom nav: a game's Join bar, the blog's sticky
 * link, create game's Next and Post game. Give the bar
 * ref={liftCookieBanner}: while it is on screen, --consent-lift on <html>
 * is how far its top is from the bottom of the window, and the banner sits
 * above that. A bar hidden at this width (lg:hidden, md:hidden) lifts
 * nothing. A React 19 ref callback: the cleanup runs when the bar goes.
 */

const bars = new Set<HTMLElement>();

function update(): void {
  let lift = 0;
  for (const el of bars) {
    const r = el.getBoundingClientRect();
    if (r.height > 0) lift = Math.max(lift, window.innerHeight - r.top);
  }
  const root = document.documentElement;
  if (lift > 0) root.style.setProperty("--consent-lift", `${Math.ceil(lift)}px`);
  else root.style.removeProperty("--consent-lift");
}

export function liftCookieBanner(el: HTMLElement | null): (() => void) | undefined {
  if (!el || typeof window === "undefined") return;
  bars.add(el);
  if (bars.size === 1) window.addEventListener("resize", update);
  const watch = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
  watch?.observe(el);
  update();
  return () => {
    watch?.disconnect();
    bars.delete(el);
    if (bars.size === 0) window.removeEventListener("resize", update);
    update();
  };
}
