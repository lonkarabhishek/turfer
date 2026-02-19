import {
  Clock,
  Ruler,
  Layers,
  Landmark,
} from "lucide-react";
import type { Turf } from "@/types/turf";

export function TurfDetails({ turf }: { turf: Turf }) {
  const details: { icon: React.ReactNode; label: string; value: string }[] = [];

  if (turf.start_time && turf.end_time) {
    details.push({
      icon: <Clock className="w-5 h-5 text-gray-500" />,
      label: "Operating Hours",
      value: `${turf.start_time} - ${turf.end_time}`,
    });
  }

  if (turf.length_feet && turf.width_feet) {
    const dim = `${turf.length_feet}ft x ${turf.width_feet}ft`;
    const heightStr = turf.height_feet ? ` x ${turf.height_feet}ft (H)` : "";
    details.push({
      icon: <Ruler className="w-5 h-5 text-gray-500" />,
      label: "Dimensions",
      value: dim + heightStr,
    });
  }

  if (turf.number_of_grounds) {
    details.push({
      icon: <Layers className="w-5 h-5 text-gray-500" />,
      label: "Number of Grounds",
      value: String(turf.number_of_grounds),
    });
  }

  if (turf.nearby_landmark) {
    details.push({
      icon: <Landmark className="w-5 h-5 text-gray-500" />,
      label: "Nearby Landmark",
      value: turf.nearby_landmark,
    });
  }

  if (turf.grass_condition) {
    details.push({
      icon: <span className="text-lg">🌱</span>,
      label: "Grass Condition",
      value: turf.grass_condition,
    });
  }

  if (turf.net_condition) {
    details.push({
      icon: <span className="text-lg">🥅</span>,
      label: "Net Condition",
      value: turf.net_condition,
    });
  }

  if (details.length === 0) return null;

  return (
    <div className="section-divider">
      <h2 className="text-[22px] font-semibold text-gray-900 mb-5">
        Turf details
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
        {details.map((item, i) => (
          <div key={i} className="flex items-start gap-4">
            <div className="mt-0.5 shrink-0">{item.icon}</div>
            <div>
              <p className="text-sm text-gray-500">{item.label}</p>
              <p className="text-base font-medium text-gray-900">{item.value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
