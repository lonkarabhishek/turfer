"use client";

import { useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  applyCityToDocument,
  CITY_REISSUED_KEY,
  clearCityPref,
  confirmedCity,
  labelFor,
  parseCityCookie,
  PICK_LEFT_KEY,
  readCityChoice,
  scopeOf,
  serializeCityChoice,
  type CitySource,
} from "@/lib/city";
import { trackCity } from "@/lib/analytics/city";
import { setPendingCity } from "./cityPending";

const MIRROR = "tapturf_city_v1";

/** The city the server rendered this page for ("" = all of India), or null off the personalised pages. */
function renderedScope(): string | null {
  const el = document.getElementById("tt-scope");
  return el ? (el.getAttribute("data-scope") ?? "") : null;
}

/** True on /, /turfs (without ?q=) and /games, whose content follows the cookie. */
function personalisedHere(): boolean {
  if (renderedScope() === null) return false;
  return !(location.pathname === "/turfs" && new URLSearchParams(location.search).get("q"));
}

/** True while the city-first pick screen (components/city/CityPick.tsx) is on show. */
function onPickScreen(): boolean {
  return document.getElementById("tt-pick") !== null;
}

/**
 * Leave the pick screen for the page the proxy now serves at this same
 * URL: a full load, so nothing of the pick screen (or a prefetch made
 * before the pick) survives in the client router. A timeout, so the
 * caller's cookie write, analytics and re-issue run first.
 */
function reloadHere() {
  window.setTimeout(() => location.replace(location.pathname + location.search), 0);
}

function idle(fn: () => void) {
  const w = window as unknown as { requestIdleCallback?: (cb: () => void) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(fn);
  else setTimeout(fn, 1);
}

type ChangeDetail = { value: string | null; source?: CitySource; stuck?: boolean; previous?: string };

/**
 * Keeps every surface in step with the city cookie. Renders nothing.
 * - On mount: mirrors the cookie into localStorage, logs a detection
 *   once, and has the server re-issue a confirmed pick once per session
 *   (Safari caps script-written cookies at 7 days). A pick the server
 *   refuses (400: not curated and no active turfs, so /, /turfs and
 *   /games 404 for it) is forgotten, and the proxy asks again.
 * - On tapturf:city-changed: on the pick screen, a full load of the same
 *   URL (the proxy now serves the city's page). Elsewhere one
 *   router.refresh(), so the proxy serves the new city's page and the
 *   client router drops old-city prefetches; also when a guessed city is
 *   confirmed, since prefetches made before it hold the pick screen. A
 *   pick from the picker while on a city page goes to the new city.
 * - On route changes (Back and Forward included), other tabs, bfcache
 *   restores and tab returns: refresh only when the page on screen was
 *   rendered for a different city, or leave a pick screen that a pick in
 *   another tab (or before a Back) already answered.
 */
export function CitySync() {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const lastScope = useRef<string | null | undefined>(undefined);
  const refreshedFor = useRef<string>("");
  const dirty = useRef(false);
  const refocus = useRef(false);
  const staleCheck = useRef<() => void>(() => {});

  // Loop guard is per page. After every route change (including Back and
  // Forward, which restore the client router's cached tree for that
  // URL), check the page on screen against the cookie once it painted.
  useEffect(() => {
    refreshedFor.current = "";
    const id = requestAnimationFrame(() => staleCheck.current());
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  useEffect(() => {
    if (isPending) return;
    setPendingCity(null);
    document.documentElement.removeAttribute("data-city-pending");
    // The refresh remounts the page, so focus that sat on the city line
    // or the picker's opener falls back to <body>: put it on the new line.
    if (refocus.current) {
      refocus.current = false;
      const a = document.activeElement;
      if (!a || a === document.body) document.getElementById("city-line")?.focus({ preventScroll: true });
    }
  }, [isPending]);

  useEffect(() => {
    if (lastScope.current === undefined) lastScope.current = scopeOf(readCityChoice());
    idle(() => {
      const c = readCityChoice();
      if (!c) return;
      const raw = serializeCityChoice(c);
      try {
        if (c.kind === "city" && localStorage.getItem(MIRROR) !== c.city) localStorage.setItem(MIRROR, c.city);
      } catch { /* ignore */ }
      if ((c.kind === "city" && c.src === "geo") || c.kind === "unknown") {
        try {
          if (localStorage.getItem("tapturf_city_detect_logged") !== raw) {
            trackCity("city_detected", { city: c.kind === "city" ? c.city : "unknown", method: "ip" });
            localStorage.setItem("tapturf_city_detect_logged", raw);
          }
        } catch { /* ignore */ }
      }
      if (confirmedCity(c)) {
        try {
          if (sessionStorage.getItem(CITY_REISSUED_KEY) !== raw) {
            sessionStorage.setItem(CITY_REISSUED_KEY, raw);
            fetch("/api/city", {
              method: "POST",
              keepalive: true,
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ choice: raw }),
            })
              .then((r) => {
                // Only a 400 means "no such city" (a 503 is a failed read),
                // and only while the cookie still holds it (no newer pick).
                const now = readCityChoice();
                if (r.status !== 400 || !now || serializeCityChoice(now) !== raw) return;
                clearCityPref();
                // /, /turfs and /games answered 404 for it. A refresh keeps
                // Next's not-found screen (it resets only on a new path), so
                // load the URL again: the proxy now serves the pick screen.
                if (["/", "/turfs", "/games"].includes(location.pathname)) reloadHere();
              })
              .catch(() => {});
          }
        } catch { /* ignore */ }
      }
    });
  }, []);

  useEffect(() => {
    const refresh = () => startTransition(() => router.refresh());

    const refreshIfStale = () => {
      if (onPickScreen()) {
        // Answered already (another tab, or a pick screen restored by Back):
        // load the city's page. Once per value and path, so a cookie the
        // server cannot see never loops.
        const picked = confirmedCity(readCityChoice());
        if (!picked) return;
        const key = `${picked}|${location.pathname}${location.search}`;
        try {
          if (sessionStorage.getItem(PICK_LEFT_KEY) === key) return;
          sessionStorage.setItem(PICK_LEFT_KEY, key);
        } catch {
          return;
        }
        reloadHere();
        return;
      }
      if (!personalisedHere()) return;
      const c = readCityChoice();
      // No cookie (blocked): the server routes by IP alone, nothing to compare.
      if (!c) return;
      const want = scopeOf(c) ?? "";
      if (renderedScope() === want) return;
      const key = `${want}|${location.pathname}`;
      if (refreshedFor.current === key) return;
      refreshedFor.current = key;
      lastScope.current = want || null;
      setPendingCity(want ? labelFor(want) : "all of India");
      document.documentElement.setAttribute("data-city-pending", "");
      refresh();
    };
    staleCheck.current = refreshIfStale;
    const onPopState = () => window.setTimeout(refreshIfStale, 60);

    const onChange = (e: Event) => {
      const d = ((e as CustomEvent).detail ?? {}) as ChangeDetail;
      const newScope = d.value ? scopeOf(parseCityCookie(d.value)) : null;
      const stuck = d.stuck !== false;
      if (!stuck) {
        // Cookies blocked: the server can never know the city, so go to its page.
        if (newScope) router.push(`/${newScope}`);
        return;
      }
      // Any pick on the pick screen: load the city's page at this URL.
      if (onPickScreen()) {
        lastScope.current = newScope;
        if (newScope) reloadHere();
        return;
      }
      // geo.pune -> pune shows the same city but unlocks the city pages.
      const confirmedNow = Boolean(d.value && confirmedCity(parseCityCookie(d.value)) && d.previous !== d.value);
      if (newScope === lastScope.current && !confirmedNow) return;
      const m = location.pathname.match(/^\/([a-z][a-z-]{1,30})(?:\/[a-z-]+)?\/?$/);
      // From the picker (a list pick or its precise location) on a city
      // page: go to the new city's page. Its sport pages can be empty for
      // another city, so this always lands on /<city>. A city page is one
      // with that city's "Make X my city" (data-mine), curated or not; the
      // path alone also matches /blog/x, /sport/football or /tools/x.
      const onCityPage = m !== null && document.querySelector(`[data-mine="${m[1]}"]`) !== null;
      if ((d.source === "picker" || d.source === "gps") && m && onCityPage && newScope && newScope !== m[1]) {
        lastScope.current = newScope;
        router.push(`/${newScope}`);
        return;
      }
      lastScope.current = newScope;
      refocus.current = true;
      if (personalisedHere()) {
        setPendingCity(newScope ? labelFor(newScope) : "all of India");
        document.documentElement.setAttribute("data-city-pending", "");
      }
      refresh();
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key !== "tapturf_city_ts" && e.key !== MIRROR) return;
      applyCityToDocument(readCityChoice());
      if (document.visibilityState === "visible") refreshIfStale();
      else dirty.current = true;
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && dirty.current) {
        dirty.current = false;
        refreshIfStale();
      }
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      applyCityToDocument(readCityChoice());
      refreshIfStale();
    };

    window.addEventListener("tapturf:city-changed", onChange);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("tapturf:city-changed", onChange);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [router]);

  return null;
}
