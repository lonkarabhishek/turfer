import {
  Car,
  Bath,
  ShieldCheck,
  Armchair,
  Wrench,
  Lightbulb,
  Droplet,
  Coffee,
  GraduationCap,
  Umbrella,
} from "lucide-react";
import type { Turf } from "@/types/turf";

/**
 * Amenity list.
 *
 * DB truth-table for the boolean columns (per data-ops brief):
 * every amenity boolean is `true` when confirmed and NULL when
 * unknown. `false` is never intentionally written, so the UI must
 * treat NULL/false the same: don't render. A crossed-out
 * "Washroom available" for a turf we haven't actually checked reads
 * as "no washroom" and misleads users.
 */
export function TurfAmenities({ turf }: { turf: Turf }) {
  const amenities: { icon: React.ReactNode; label: string }[] = [];

  if (turf.is_covered) amenities.push({ icon: <Umbrella className="w-5 h-5" />, label: "Covered / netted" });
  if (turf.has_floodlights) amenities.push({ icon: <Lightbulb className="w-5 h-5" />, label: "Floodlights" });
  if (turf.parking_available) amenities.push({ icon: <Car className="w-5 h-5" />, label: "Free parking on premises" });
  if (turf.washroom_available) amenities.push({ icon: <Bath className="w-5 h-5" />, label: "Washroom available" });
  if (turf.changing_room_available) amenities.push({ icon: <ShieldCheck className="w-5 h-5" />, label: "Changing room" });
  if (turf.sitting_area_available) amenities.push({ icon: <Armchair className="w-5 h-5" />, label: "Sitting area" });
  if (turf.has_drinking_water) amenities.push({ icon: <Droplet className="w-5 h-5" />, label: "Drinking water" });
  if (turf.has_cafeteria) amenities.push({ icon: <Coffee className="w-5 h-5" />, label: "Cafeteria" });
  if (turf.coaching_available) amenities.push({ icon: <GraduationCap className="w-5 h-5" />, label: "Coaching available" });
  if (turf.equipment_provided) amenities.push({ icon: <Wrench className="w-5 h-5" />, label: "Equipment provided" });

  // Free-form amenities from the legacy jsonb array. Guard against a
  // few strings we already model as booleans above so we don't render
  // "Floodlights" twice.
  const shownLabels = new Set(amenities.map((a) => a.label.toLowerCase()));
  for (const a of turf.amenities ?? []) {
    if (!a || typeof a !== "string") continue;
    const k = a.toLowerCase().trim();
    if (
      k.includes("light") ||
      k.includes("parking") ||
      k.includes("washroom") ||
      k.includes("toilet") ||
      k.includes("changing") ||
      k.includes("water") ||
      k.includes("cafe") ||
      k.includes("coach") ||
      k.includes("equipment") ||
      k.includes("covered") ||
      k.includes("sit")
    ) {
      continue;
    }
    if (shownLabels.has(k)) continue;
    shownLabels.add(k);
    amenities.push({ icon: <span className="text-lg">•</span>, label: a });
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
            className="flex items-center gap-4 py-3.5 px-4 rounded-xl transition-colors hover:bg-primary-50"
          >
            <span className="text-primary-500">{item.icon}</span>
            <span className="text-base text-primary-700">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
