"use client";

import { MapPin } from "lucide-react";
import { labelFor, openCityPicker } from "@/lib/city";
import { useCityChoice } from "./useCityChoice";
import { prefetchLiveCities } from "./liveCityList";

/**
 * The city row in the header menu. Rendered only while the menu is
 * open, so reading the cookie here never affects the first paint.
 * "Change" closes the menu and opens the city picker. The retired "all"
 * cookie reads as "Not set", like unknown: there is no all-India choice.
 */
export function CityMenuRow({ onChange }: { onChange: () => void }) {
  const c = useCityChoice();
  const label =
    c?.kind === "city" ? (c.src === "geo" ? `${labelFor(c.city)}, from your location` : labelFor(c.city)) : "Not set";

  return (
    <button
      type="button"
      // The picker's counts come from /api/cities: start it before the tap lands.
      onPointerDown={prefetchLiveCities}
      onPointerEnter={prefetchLiveCities}
      onFocus={prefetchLiveCities}
      onClick={() => {
        onChange();
        // After the menu's own close, so focus and scroll lock hand over cleanly.
        setTimeout(() => openCityPicker("list"), 0);
      }}
      className="w-full flex items-center justify-between gap-3 px-3 py-3 min-h-[48px] rounded-2xl hover:bg-primary-50 transition-colors focus-neon"
      aria-label={`City: ${label}. Change`}
    >
      <span className="flex items-center gap-3 min-w-0">
        <span className="w-9 h-9 rounded-xl bg-accent-50 border border-accent-500/30 flex items-center justify-center shrink-0">
          <MapPin className="w-4 h-4 text-accent-600" />
        </span>
        <span className="text-left min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-primary-500">City</span>
          <span className="block text-[15px] font-semibold text-primary-900 truncate">{label}</span>
        </span>
      </span>
      <span className="text-[13px] font-semibold text-accent-700 shrink-0">Change</span>
    </button>
  );
}
