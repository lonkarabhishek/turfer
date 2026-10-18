"use client";

import { useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  applyCityToDocument,
  isKnownCity,
  labelFor,
  parseCityCookie,
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

function idle(fn: () => void) {
  const w = window as unknown as { requestIdleCallback?: (cb: () => void) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(fn);
  else setTimeout(fn, 1);
}

type ChangeDetail = { value: string | null; source?: CitySource; stuck?: boolean; previous?: string };

/**
 * Keeps every surface in step with the city cookie. Renders nothing.
 * - On mount: mirrors the cookie into localStorage, logs a detection
 *   once, and has the server re-issue an explicit choice once per
 *   session (Safari caps script-written cookies at 7 days).
 * - On tapturf:city-changed: one router.refresh(), so the proxy serves
 *   the new city's page and the client router drops old-city prefetches.
 *   A pick from the picker while on a city page goes to the new city.
 * - On other tabs, bfcache restores and tab returns: refresh only when
 *   the page on screen was rendered for a different city.
 */
export function CitySync() {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const lastScope = useRef<string | null | undefined>(undefined);
  const refreshedFor = useRef<string>("");
  const dirty = useRef(false);

  // Loop guard is per page.
  useEffect(() => {
    refreshedFor.current = "";
  }, [pathname]);

  useEffect(() => {
    if (!isPending) {
      setPendingCity(null);
      document.documentElement.removeAttribute("data-city-pending");
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
      if ((c.kind === "city" && c.src === "pick") || c.kind === "all") {
        try {
          if (sessionStorage.getItem("tt_city_reissued") !== raw) {
            sessionStorage.setItem("tt_city_reissued", raw);
            fetch("/api/city", {
              method: "POST",
              keepalive: true,
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ choice: raw }),
            }).catch(() => {});
          }
        } catch { /* ignore */ }
      }
    });
  }, []);

  useEffect(() => {
    const refresh = () => startTransition(() => router.refresh());

    const refreshIfStale = () => {
      if (!personalisedHere()) return;
      const want = scopeOf(readCityChoice()) ?? "";
      if (renderedScope() === want) return;
      const key = `${want}|${location.pathname}`;
      if (refreshedFor.current === key) return;
      refreshedFor.current = key;
      lastScope.current = want || null;
      refresh();
    };

    const onChange = (e: Event) => {
      const d = ((e as CustomEvent).detail ?? {}) as ChangeDetail;
      const newScope = d.value ? scopeOf(parseCityCookie(d.value)) : null;
      const stuck = d.stuck !== false;
      if (newScope === lastScope.current && stuck) return;
      if (!stuck) {
        // Cookies blocked: the server can never know the city, so go to its page.
        if (newScope) router.push(`/${newScope}`);
        return;
      }
      const m = location.pathname.match(/^\/([a-z][a-z-]{1,30})(?:\/[a-z-]+)?\/?$/);
      if (d.source === "picker" && m && isKnownCity(m[1]) && newScope && newScope !== m[1]) {
        lastScope.current = newScope;
        router.push(`/${newScope}`);
        return;
      }
      lastScope.current = newScope;
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
    return () => {
      window.removeEventListener("tapturf:city-changed", onChange);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [router]);

  return null;
}
