import {
  Car,
  Bath,
  ShieldCheck,
  Armchair,
  Wrench,
  Check,
  X,
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
      icon: <Car className="w-6 h-6" />,
      label: "Free parking on premises",
      available: !!turf.parking_available,
    });
  }

  if (turf.washroom_available !== null) {
    amenities.push({
      icon: <Bath className="w-6 h-6" />,
      label: "Washroom available",
      available: !!turf.washroom_available,
    });
  }

  if (turf.changing_room_available !== null) {
    amenities.push({
      icon: <ShieldCheck className="w-6 h-6" />,
      label: "Changing room",
      available: !!turf.changing_room_available,
    });
  }

  if (turf.sitting_area_available !== null) {
    amenities.push({
      icon: <Armchair className="w-6 h-6" />,
      label: "Sitting area",
      available: !!turf.sitting_area_available,
    });
  }

  if (turf.equipment_provided !== null) {
    amenities.push({
      icon: <Wrench className="w-6 h-6" />,
      label: "Equipment provided",
      available: !!turf.equipment_provided,
    });
  }

  if (amenities.length === 0) return null;

  return (
    <div className="section-divider">
      <h2 className="text-[22px] font-semibold text-gray-900 mb-5">
        What this place offers
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {amenities.map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-4 py-3"
          >
            <span className={item.available ? "text-gray-700" : "text-gray-300"}>
              {item.icon}
            </span>
            <span className={`text-base ${item.available ? "text-gray-700" : "text-gray-400 line-through"}`}>
              {item.label}
            </span>
            {item.available ? (
              <Check className="w-4 h-4 text-green-500 ml-auto shrink-0" />
            ) : (
              <X className="w-4 h-4 text-gray-300 ml-auto shrink-0" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
