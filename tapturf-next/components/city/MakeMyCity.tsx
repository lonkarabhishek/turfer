"use client";

import { Check, MapPin } from "lucide-react";
import { setCityPref } from "@/lib/city";

/**
 * "Make Pune my city" on a city page. Which of the two pills shows is
 * decided by CSS from <html data-city data-city-src>, set before the
 * first paint, so a visitor who picked this city sees "Pune is your
 * city" with no swap. An IP guess (geo.pune) is not a pick: it still
 * gets the button, since /, /turfs and /games ask until a city is
 * confirmed. Works before hydration as a native form post. `city` must
 * be validated by the server page before it reaches the inline style.
 */
export function MakeMyCity({ city, label }: { city: string; label: string }) {
  return (
    <span data-mine={city} className="inline-flex">
      <style>{`html[data-city="${city}"][data-city-src="pick"] [data-mine="${city}"] .mine-no{display:none}html[data-city="${city}"][data-city-src="pick"] [data-mine="${city}"] .mine-yes{display:inline-flex}`}</style>
      <form
        method="post"
        action="/api/city"
        onSubmit={(e) => {
          e.preventDefault();
          setCityPref(city, { source: "make_my_city" });
        }}
      >
        <input type="hidden" name="next" value={`/${city}`} />
        <button
          name="choice"
          value={city}
          className="mine-no h-11 px-4 inline-flex items-center gap-2 rounded-full border border-primary-200 bg-white text-[14px] font-semibold text-primary-900 press-tight focus-neon"
        >
          <MapPin className="w-4 h-4 text-accent-600" />
          Make {label} my city
        </button>
      </form>
      <span className="mine-yes h-11 px-4 items-center gap-2 rounded-full bg-accent-50 text-[14px] font-semibold text-accent-700">
        <Check className="w-4 h-4" />
        {label} is your city
      </span>
    </span>
  );
}
