import { CalendarClock } from "lucide-react";
import { FREE_REQUEST, type FreeLine } from "@/lib/availability/free";

/**
 * A card's free hours (lib/availability/free.ts freeLine): "Free today: 6
 * PM, 7 PM", who marked them and when, and "Request a free hour" on a turf
 * that takes booking requests. Inside the card's own link, which goes to
 * the turf page's free slots (#free-slots), so nothing here is a link.
 * data-nosnippet: times that change by the hour are never a search
 * snippet. Only drawn after the page has loaded (the lists and Ask fetch
 * them), never in a page's HTML. A plain function with no hooks.
 */
export function FreeHoursLine({ line, compact = false }: { line: FreeLine; compact?: boolean }) {
  const times = `${line.times.join(", ")}${line.more > 0 ? ` +${line.more}` : ""}`;
  return (
    <div data-nosnippet="" className={compact ? "mt-1.5" : "mt-2 rounded-xl bg-accent-50 border border-accent-100 px-2.5 py-1.5"}>
      <p className={`flex items-start gap-1.5 font-semibold text-accent-800 ${compact ? "text-[12px]" : "text-[13px]"}`}>
        <CalendarClock className={`${compact ? "w-3.5 h-3.5" : "w-4 h-4"} shrink-0 mt-px`} aria-hidden />
        <span className="min-w-0">
          {line.lead}: <span className="tabular-nums">{times}</span>
        </span>
      </p>
      <p className={`${compact ? "text-[11px]" : "text-[12px]"} text-primary-600 leading-snug`}>
        {line.marked}
        {line.requests && (
          <>
            {" · "}
            <span className="font-semibold text-accent-700 underline underline-offset-2">{FREE_REQUEST}</span>
          </>
        )}
      </p>
    </div>
  );
}
