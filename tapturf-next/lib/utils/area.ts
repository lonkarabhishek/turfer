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
// An area is its display name, or [display name, ...other spellings
// seen in addresses]. Every name here comes from real turf addresses.
type Area = string | readonly [string, ...string[]];

const AREAS_PUNE: Area[] = [
  "Kothrud",
  "Chinchwad",
  "Pimpri-Chinchwad",
  "Pimpri",
  "Pimple Gurav",
  "Undri",
  ["Hinjewadi", "Hinjawadi"],
  "Baner",
  "Balewadi",
  "Ravet",
  "Aundh",
  "Punawale",
  ["Hadapsar", "Bhekrai Nagar"],
  "Amanora",
  "Kharadi",
  "Mundhwa",
  "Pashan",
  "Tathawade",
  "Thergaon",
  "Bavdhan",
  "Bhugaon",
  "Viman Nagar",
  "Vadgaon Sheri",
  "Wakad",
  "Gahunje",
  "Dhanori",
  "Bibwewadi",
  ["Sinhagad Road", "Sinhgad Road", "Sinhgad Rd"],
  ["Sinhagad", "Sinhgad"],
  "Anand Nagar",
  "Narhe",
  "Warje",
  ["Ambegaon", "Ambegao"],
  "Katraj",
  "Wagholi",
  "Wanowrie",
  ["Karve Nagar", "Karvenagar"],
  "Kondhwa",
  ["Mohammed Wadi", "Mohammadwadi"],
  "NIBM",
  "Koregaon Park",
  "Keshav Nagar",
  "Erandwane",
  "Yerawada",
  ["Shivaji Nagar", "Shivajinagar"],
  ["Senapati Bapat Road", "Senapati Bapat Rd", "SB Road"],
  "Narayan Peth",
  ["Market Yard", "Marketyard"],
  ["Manik Baug", "Manikbaug"],
  "Chincholi",
];

const AREAS_NASHIK: Area[] = [
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
  ["Panchavati", "Panchvati", "Pachwati"],
  "College Road",
  "CIDCO",
  "Mumbai Naka",
  "Nandur Naka",
  "Savarkar Nagar",
  "Jagtap Nagar",
  "Patil Nagar",
  "Amrutdham",
  ["Rasbihari Road", "Rasbihari"],
  ["Trimbak Road", "Trambakeshwar Rd", "Trimbakeshwar Road", "Trimbak Rd"],
  ["Pakhal Road", "Pakhal Rd"],
  "Pipeline Road",
  "Kalpataru Nagar",
  "Talathi Colony",
  "Pramod Nagar",
  "Wavre Nagar",
  "Jalapur",
  ["Datta Nagar", "Dattanagar"],
  "Bhagur",
];

const AREAS_MUMBAI: Area[] = [
  ["Mira Road", "Mira Bhayandar"],
  "Lower Parel",
  "Dadar",
  ["Bandra", "Bandra West"],
  "Mulund",
  "Ghatkopar",
  "Panvel",
  "Kharghar",
  "Thane",
  "Malad",
  "Kandivali",
  "Vashi",
  "Airoli",
  "Nerul",
  ["Andheri East", "Marol"],
  "Andheri West",
  ["Churchgate", "Marine Lines"],
  "Powai",
  "Chandivali",
  "Saki Naka",
  "Goregaon",
  "Chembur",
  "Wadala",
  "Borivali",
  "Dahisar",
  "Santacruz",
  "Juhu",
  "Kurla",
  "Vikhroli",
  "Bhandup",
];

/** [spelling, display name], longest spelling first so "Nashik Road" wins over "Nashik". */
function matchers(pool: Area[]): [string, string][] {
  return pool
    .flatMap((a): [string, string][] =>
      typeof a === "string" ? [[a.toLowerCase(), a]] : a.map((alt): [string, string] => [alt.toLowerCase(), a[0]]),
    )
    .sort((x, y) => y[0].length - x[0].length || x[0].localeCompare(y[0]));
}

const MATCH = {
  nashik: matchers(AREAS_NASHIK),
  pune: matchers(AREAS_PUNE),
  mumbai: matchers(AREAS_MUMBAI),
  any: matchers([...AREAS_NASHIK, ...AREAS_PUNE, ...AREAS_MUMBAI]),
};

export function areaFor(turf: Pick<Turf, "address" | "city"> & { area?: string | null }): string | null {
  // Data ops now set turfs.area directly; the address scan is the fallback.
  if (turf.area) return turf.area;
  const addr = (turf.address ?? "").toLowerCase();
  if (!addr) return null;
  const list =
    turf.city === "nashik" || turf.city === "pune" || turf.city === "mumbai" ? MATCH[turf.city] : MATCH.any;
  for (const [spelling, name] of list) {
    if (addr.includes(spelling)) return name;
  }
  return null;
}
