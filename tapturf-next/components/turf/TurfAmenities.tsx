import {
  Car,
  Bath,
  ShieldCheck,
  Armchair,
  Wrench,
} from "lucide-react";
import type { Turf } from "@/types/turf";

interface AmenityItem {
  icon: React.ReactNode;
  label: string;
  available: boolean;
}

export function TurfAmenities({ turf }: { turf: Turf }) {
  const amenities: AmenityItem[] = [];

  if (turf.parking_available !== null) {
    amenities.push({
      icon: <Car className="w-5 h-5" />,
      label: "Free parking on premises",
      available: !!turf.parking_available,
    });
  }

  if (turf.washroom_available !== null) {
    amenities.push({
      icon: <Bath className="w-5 h-5" />,
      label: "Washroom available",
      available: !!turf.washroom_available,
    });
  }

  if (turf.changing_room_available !== null) {
    amenities.push({
      icon: <ShieldCheck className="w-5 h-5" />,
      label: "Changing room",
      available: !!turf.changing_room_available,
    });
  }

  if (turf.sitting_area_available !== null) {
    amenities.push({
      icon: <Armchair className="w-5 h-5" />,
      label: "Sitting area",
      available: !!turf.sitting_area_available,
    });
  }

  if (turf.equipment_provided !== null) {
    amenities.push({
      icon: <Wrench className="w-5 h-5" />,
      label: "Equipment provided",
      available: !!turf.equipment_provided,
    });
  }

  if (amenities.length === 0) return null;

  return (
    <div className="section-divider">
      <h2 className="text-[22px] font-bold text-primary-800 mb-5 font-serif">
        What this place offers
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
        {amenities.map((item, i) => (
          <div
            key={i}
            className={`flex items-center gap-4 py-3.5 px-4 rounded-xl transition-colors ${
              item.available ? "hover:bg-primary-50" : "opacity-50"
            }`}
          >
            <span className={item.available ? "text-primary-500" : "text-cream-400"}>
              {item.icon}
            </span>
            <span className={`text-base ${item.available ? "text-primary-700" : "text-primary-300 line-through"}`}>
              {item.label}
            </span>
            {item.available && (
              <span className="ml-auto w-5 h-5 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                <span className="text-primary-600 text-xs font-bold">✓</span>
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
