import { ExternalLink } from "lucide-react";
import type { Turf } from "@/types/turf";
import { formatPrice, getTextPriceMentions, priceUnitSuffix } from "@/lib/utils/prices";

export function TurfPricing({ turf }: { turf: Turf }) {
  const unit = priceUnitSuffix(turf);
  // Research notes ("Rs 500 per hour (Day), Rs 600 (Night)" with a
  // source). Shown when we have no price table of our own.
  const mentions = getTextPriceMentions(turf).slice(0, 3);
  const hasWeekendPricing =
    turf.weekend_morning_price ||
    turf.weekend_afternoon_price ||
    turf.weekend_evening_price;

  const rows: {
    slot: string;
    emoji: string;
    time: string;
    weekday: number | null;
    weekend: number | null;
  }[] = [];

  if (turf.morning_price || turf.weekend_morning_price) {
    rows.push({
      slot: "Morning",
      emoji: "🌅",
      time: "6AM – 12PM",
      weekday: turf.morning_price,
      weekend: turf.weekend_morning_price,
    });
  }

  if (turf.afternoon_price || turf.weekend_afternoon_price) {
    rows.push({
      slot: "Afternoon",
      emoji: "☀️",
      time: "12PM – 5PM",
      weekday: turf.afternoon_price,
      weekend: turf.weekend_afternoon_price,
    });
  }

  if (turf.evening_price || turf.weekend_evening_price) {
    rows.push({
      slot: "Evening",
      emoji: "🌙",
      time: "5PM – Close",
      weekday: turf.evening_price,
      weekend: turf.weekend_evening_price,
    });
  }

  if (rows.length === 0 && mentions.length === 0) return null;

  if (rows.length === 0) {
    return (
      <div className="section-divider">
        <h2 className="text-[22px] font-bold text-primary-800 mb-2 font-serif">Pricing</h2>
        <p className="text-[13px] text-primary-500 mb-4">
          Reported prices from the turf&apos;s website or reviews. Unverified, confirm with the turf.
        </p>
        <ul className="space-y-3">
          {mentions.map((m, i) => (
            <li key={i} className="rounded-2xl border border-cream-300 bg-cream-50 px-4 py-3">
              <p className="text-[15px] leading-snug text-primary-800">
                <span className="font-semibold text-primary-500">Reported: </span>
                {m.text}
              </p>
              <p className="mt-1.5 text-[12px] text-primary-400 flex flex-wrap items-center gap-x-3">
                {m.date && <span>{formatMentionDate(m.date)}</span>}
                {m.source_url && (
                  <a
                    href={m.source_url}
                    target="_blank"
                    rel="noopener nofollow"
                    className="inline-flex items-center gap-1 text-accent-600 hover:text-accent-700"
                  >
                    Source <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </p>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="section-divider">
      <h2 className="text-[22px] font-bold text-primary-800 mb-5 font-serif">Pricing</h2>
      <div className="overflow-x-auto rounded-2xl border border-cream-300">
        <table className="w-full">
          <thead>
            <tr className="bg-primary-50 border-b border-cream-300">
              <th className="text-left py-3.5 px-5 text-xs font-semibold text-primary-500">
                Time Slot
              </th>
              <th className="text-right py-3.5 px-5 text-xs font-semibold text-primary-500">
                Weekday
              </th>
              {hasWeekendPricing && (
                <th className="text-right py-3.5 px-5 text-xs font-semibold text-primary-500">
                  Weekend
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.slot}
                className={`border-b border-cream-200 last:border-0 ${
                  i % 2 === 0 ? "bg-white" : "bg-cream-50"
                }`}
              >
                <td className="py-4 px-5">
                  <span className="text-base text-primary-700 font-medium">
                    {row.emoji} {row.slot}
                  </span>
                  <span className="text-xs text-primary-400 ml-2">{row.time}</span>
                </td>
                <td className="py-4 px-5 text-right">
                  <span className="text-base font-bold text-primary-800 font-serif">
                    {formatPrice(row.weekday)}
                  </span>
                  <span className="text-xs text-primary-400">{unit}</span>
                </td>
                {hasWeekendPricing && (
                  <td className="py-4 px-5 text-right">
                    <span className="text-base font-bold text-accent-600 font-serif">
                      {formatPrice(row.weekend)}
                    </span>
                    <span className="text-xs text-primary-400">{unit}</span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** "2026-09-30" -> "Sep 2026"; anything else is shown as stored. */
function formatMentionDate(d: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(d);
  if (!m) return d;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  return date.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}
