import type { Turf } from "@/types/turf";
import { formatPrice } from "@/lib/utils/prices";

export function TurfPricing({ turf }: { turf: Turf }) {
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

  if (rows.length === 0) return null;

  return (
    <div className="section-divider">
      <h2 className="text-[22px] font-bold text-primary-800 mb-5 font-serif">Pricing</h2>
      <div className="overflow-x-auto rounded-2xl border border-cream-300">
        <table className="w-full">
          <thead>
            <tr className="bg-primary-50 border-b border-cream-300">
              <th className="text-left py-3.5 px-5 text-xs font-semibold text-primary-500 uppercase tracking-wider">
                Time Slot
              </th>
              <th className="text-right py-3.5 px-5 text-xs font-semibold text-primary-500 uppercase tracking-wider">
                Weekday
              </th>
              {hasWeekendPricing && (
                <th className="text-right py-3.5 px-5 text-xs font-semibold text-primary-500 uppercase tracking-wider">
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
                  <span className="text-xs text-primary-400">/hr</span>
                </td>
                {hasWeekendPricing && (
                  <td className="py-4 px-5 text-right">
                    <span className="text-base font-bold text-accent-600 font-serif">
                      {formatPrice(row.weekend)}
                    </span>
                    <span className="text-xs text-primary-400">/hr</span>
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
