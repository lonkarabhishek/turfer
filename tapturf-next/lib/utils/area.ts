import type { Turf } from "@/types/turf";

/**
 * Area extraction from address strings.
 *
 * The DB has no area column, so titles and meta descriptions derive
 * area from `address` (P2-1 will lean on this too). Substring matches
 * are ordered from most specific → least specific so "Nashik Road"
 * wins over "Nashik". Curated list; extend as we launch new zones.
 *
 * Multi-token areas are listed with common alternates ("Pathardi
 * Phata" also matches bare "Pathardi").
 */
const AREAS_PUNE = [
  "Kothrud",
  "Chinchwad",
  "Pimpri-Chinchwad",
  "Pimpri",
  "Undri",
  "Hinjewadi",
  "Baner",
  "Ravet",
  "Aundh",
  "Punawale",
  "Hadapsar",
  "Kharadi",
  "Mundhwa",
  "Pashan",
  "Tathawade",
  "Bavdhan",
  "Viman Nagar",
  "Wakad",
  "Dhanori",
  "Bibwewadi",
  "Sinhagad Road",
  "Sinhagad",
  "Wagholi",
  "Wanowrie",
  "Karve Nagar",
  "Kondhwa",
  "Koregaon Park",
  "Erandwane",
];

const AREAS_NASHIK = [
  "Nashik Road",
  "Deolali",
  "Gangapur Road",
  "Gangapur",
  "Pathardi Phata",
  "Pathardi",
  "Makhmalabad",
  "Govind Nagar",
  "Satpur",
  "Anandvalli",
  "Rane Nagar",
  "Indira Nagar",
  "Panchavati",
  "College Road",
  "CIDCO",
];

function orderBySpecificity(a: string, b: string): number {
  // Longer, multi-token names first so "Nashik Road" wins over "Nashik".
  if (b.length !== a.length) return b.length - a.length;
  return a.localeCompare(b);
}

export function areaFor(turf: Pick<Turf, "address" | "city">): string | null {
  const addr = (turf.address ?? "").toLowerCase();
  if (!addr) return null;
  const pool =
    turf.city === "nashik"
      ? AREAS_NASHIK
      : turf.city === "pune"
        ? AREAS_PUNE
        : [...AREAS_NASHIK, ...AREAS_PUNE];
  const sorted = [...pool].sort(orderBySpecificity);
  for (const name of sorted) {
    if (addr.includes(name.toLowerCase())) return name;
  }
  return null;
}
