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
      time: "6AM - 12PM",
      weekday: turf.morning_price,
      weekend: turf.weekend_morning_price,
    });
  }

  if (turf.afternoon_price || turf.weekend_afternoon_price) {
    rows.push({
      slot: "Afternoon",
      emoji: "☀️",
      time: "12PM - 5PM",
      weekday: turf.afternoon_price,
      weekend: turf.weekend_afternoon_price,
    });
  }

  if (turf.evening_price || turf.weekend_evening_price) {
    rows.push({
      slot: "Evening",
      emoji: "🌙",
      time: "5PM - Close",
      weekday: turf.evening_price,
      weekend: turf.weekend_evening_price,
    });
  }

  if (rows.length === 0) return null;

  return (
    <div className="section-divider">
      <h2 className="text-[22px] font-semibold text-gray-900 mb-5">Pricing</h2>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 pr-4 text-sm font-medium text-gray-500">
                Time Slot
              </th>
              <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">
                Weekday
              </th>
              {hasWeekendPricing && (
                <th className="text-right py-3 pl-4 text-sm font-medium text-gray-500">
                  Weekend
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.slot} className="border-b border-gray-100 last:border-0">
                <td className="py-4 pr-4">
                  <span className="text-base text-gray-900">
                    {row.emoji} {row.slot}
                  </span>
                  <span className="text-xs text-gray-400 ml-2">{row.time}</span>
                </td>
                <td className="py-4 px-4 text-right">
                  <span className="text-base font-semibold text-gray-900">
                    {formatPrice(row.weekday)}
                  </span>
                  <span className="text-xs text-gray-400">/hr</span>
                </td>
                {hasWeekendPricing && (
                  <td className="py-4 pl-4 text-right">
                    <span className="text-base font-semibold text-gray-900">
                      {formatPrice(row.weekend)}
                    </span>
                    <span className="text-xs text-gray-400">/hr</span>
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
