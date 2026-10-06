import {
  Clock,
  Ruler,
  Layers,
  Landmark,
  Square,
  Users,
  Globe,
  Instagram,
  ExternalLink,
} from "lucide-react";
import type { Turf } from "@/types/turf";
import { normaliseOpeningHours, istWeekdayName, formatSpan } from "@/lib/utils/hours";

export function TurfDetails({ turf }: { turf: Turf }) {
  const hoursRows = normaliseOpeningHours(turf.opening_hours, {
    start_time: turf.start_time,
    end_time: turf.end_time,
    is_24x7: turf.is_24x7,
  });
  const today = istWeekdayName();

  const details: { icon: React.ReactNode; label: string; value: string }[] = [];

  if (turf.surface_type) {
    details.push({
      icon: <Square className="w-5 h-5 text-primary-400" />,
      label: "Surface",
      value: titleCase(turf.surface_type),
    });
  }

  if (turf.ground_format) {
    details.push({
      icon: <Users className="w-5 h-5 text-primary-400" />,
      label: "Format",
      value: turf.ground_format,
    });
  }

  if (turf.length_feet && turf.width_feet) {
    const dim = `${turf.length_feet}ft × ${turf.width_feet}ft`;
    const heightStr = turf.height_feet ? ` × ${turf.height_feet}ft (H)` : "";
    details.push({
      icon: <Ruler className="w-5 h-5 text-primary-400" />,
      label: "Dimensions",
      value: dim + heightStr,
    });
  }

  if (turf.number_of_grounds && turf.number_of_grounds > 1) {
    details.push({
      icon: <Layers className="w-5 h-5 text-primary-400" />,
      label: "Number of Grounds",
      value: String(turf.number_of_grounds),
    });
  }

  if (turf.nearby_landmark) {
    details.push({
      icon: <Landmark className="w-5 h-5 text-primary-400" />,
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

  // Public links from research. nofollow: these are venue pages, not endorsements.
  const links: { href: string; label: string; icon: React.ReactNode; text: string }[] = [];
  if (turf.website_url) {
    links.push({ href: turf.website_url, label: "Website", icon: <Globe className="w-5 h-5 text-primary-400" />, text: hostOf(turf.website_url) });
  }
  if (turf.instagram_url) {
    links.push({ href: turf.instagram_url, label: "Instagram", icon: <Instagram className="w-5 h-5 text-primary-400" />, text: handleOf(turf.instagram_url) });
  }

  // "Closed Mondays": mark that day in the table too.
  const closedDays = turf.closed_days?.trim() || null;
  const isClosedDay = (day: string) => !!closedDays && new RegExp(`\\b${day}`, "i").test(closedDays);

  const hasFacts = details.length > 0 || links.length > 0;
  const hasHours = hoursRows.length > 0;

  if (!hasFacts && !hasHours) return null;

  return (
    <div className="section-divider">
      <h2 className="text-[22px] font-bold text-primary-800 mb-5 font-serif">
        Turf details
      </h2>

      {hasFacts && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 mb-8">
          {details.map((item, i) => (
            <div key={i} className="flex items-start gap-4">
              <div className="mt-0.5 shrink-0">{item.icon}</div>
              <div>
                <p className="text-xs font-semibold text-primary-400">
                  {item.label}
                </p>
                <p className="text-base font-medium text-primary-800 mt-0.5">
                  {item.value}
                </p>
              </div>
            </div>
          ))}
          {links.map((l) => (
            <div key={l.label} className="flex items-start gap-4">
              <div className="mt-0.5 shrink-0">{l.icon}</div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-primary-400">{l.label}</p>
                <a
                  href={l.href}
                  target="_blank"
                  rel="noopener nofollow"
                  className="inline-flex items-center gap-1 text-base font-medium text-accent-600 hover:text-accent-700 mt-0.5 max-w-full"
                >
                  <span className="truncate">{l.text}</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {hasHours && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-5 h-5 text-primary-400" />
            <h3 className="text-xs font-semibold text-primary-400">
              Opening hours
            </h3>
            {closedDays && (
              <span className="ml-auto text-xs font-medium text-hot-600">Closed {closedDays}</span>
            )}
          </div>
          <ul className="rounded-2xl border border-cream-300 divide-y divide-cream-200 overflow-hidden">
            {hoursRows.map((row) => {
              const isToday = row.day === today;
              const closed = row.closed || isClosedDay(row.day);
              return (
                <li
                  key={row.day}
                  className={`flex items-center justify-between px-4 py-2.5 text-sm ${
                    isToday ? "bg-accent-50/60" : "bg-white"
                  }`}
                >
                  <span
                    className={`font-medium ${
                      isToday ? "text-accent-700" : "text-primary-700"
                    }`}
                  >
                    {row.day}
                    {isToday && (
                      <span className="ml-2 text-[10px] text-accent-600">
                        Today
                      </span>
                    )}
                  </span>
                  <span
                    className={`tabular-nums ${
                      closed ? "text-primary-400 italic" : "text-primary-800"
                    }`}
                  >
                    {closed
                      ? "Closed"
                      : row.spans.length
                        ? row.spans.map(formatSpan).join(", ")
                        : row.raw}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** "https://www.niwec.org/sport-fees/" -> "niwec.org" */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** "https://instagram.com/niwecclub/" -> "@niwecclub" */
function handleOf(url: string): string {
  const m = /instagram\.com\/([^/?#]+)/i.exec(url);
  return m ? `@${m[1]}` : hostOf(url);
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
