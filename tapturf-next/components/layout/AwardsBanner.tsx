"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Trophy, X } from "lucide-react";
import { getCityPref, isCity, labelFor } from "@/lib/city";

// One banner per awards edition: bump both when the October post goes up.
const POST = "/blog/september-2026-turf-awards";
const DISMISS_KEY = "tapturf_awards_banner_2026_09";
// Cities with a section in this edition. Others (Nagpur joined in October) get the general line.
const POST_CITIES = new Set(["nashik", "pune", "mumbai"]);

const subscribe = (cb: () => void) => {
  window.addEventListener("tapturf:city-changed", cb);
  window.addEventListener("storage", cb);
  window.addEventListener("tapturf:awards-banner", cb);
  return () => {
    window.removeEventListener("tapturf:city-changed", cb);
    window.removeEventListener("storage", cb);
    window.removeEventListener("tapturf:awards-banner", cb);
  };
};
// "city|dismissed" so one store covers both; a string keeps snapshots stable.
const snapshot = () => {
  let dismissed = "0";
  try {
    dismissed = localStorage.getItem(DISMISS_KEY) ? "1" : "0";
  } catch {
    /* private mode */
  }
  return `${getCityPref() ?? ""}|${dismissed}`;
};
const serverSnapshot = () => null;

/**
 * Slim strip under the header pointing at the monthly awards post for
 * the visitor's city. The cross hides it for good (localStorage).
 * Rendered only on the client so there is no flash for people who
 * already closed it; hidden on the post itself and in admin.
 */
export function AwardsBanner() {
  const pathname = usePathname();
  const state = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  if (state == null) return null;
  const [cityRaw, dismissed] = state.split("|");
  if (dismissed === "1") return null;
  if (pathname.startsWith(POST) || pathname.startsWith("/admin") || pathname.startsWith("/login")) return null;

  const city = isCity(cityRaw) && POST_CITIES.has(cityRaw) ? cityRaw : null;
  const href = city ? `${POST}#${city}` : POST;
  const where = city ? labelFor(city) : "Nashik, Pune and Mumbai";
  // Phones get about 45 characters before the cross; keep the city visible.
  const short = city ? `best turfs in ${labelFor(city)}` : "best turfs in each city";

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event("tapturf:awards-banner"));
  };

  return (
    <div className="bg-primary-900 text-white">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-10 flex items-center gap-2">
        <Link href={href} className="group flex items-center gap-2 min-w-0 flex-1 text-[13px] sm:text-[14px]">
          <Trophy className="w-4 h-4 shrink-0 text-[#e0a92e]" strokeWidth={2.25} />
          <span className="truncate sm:hidden">
            <span className="font-semibold">September Awards:</span>{" "}
            <span className="text-white/80">{short}</span>
            <span aria-hidden className="ml-1 inline-block">→</span>
          </span>
          <span className="truncate hidden sm:inline">
            <span className="font-semibold">September Awards are out.</span>{" "}
            <span className="text-white/80">See the best turfs in {where}</span>
            <span aria-hidden className="ml-1 inline-block transition-transform group-hover:translate-x-0.5">→</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Hide this message"
          className="shrink-0 w-8 h-8 -mr-1.5 inline-flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 active:bg-white/20 transition-colors"
        >
          <X className="w-4 h-4" strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}
