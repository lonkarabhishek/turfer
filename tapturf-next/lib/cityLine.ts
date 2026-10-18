import type { CityScope } from "./city";

/** Props for components/city/CityLine.tsx, from a page's resolved scope. */
export type CityLineProps =
  | { kind: "city"; label: string; changeHref: string }
  | { kind: "fallback"; requestedLabel: string; showing: { label: string; km: number } | null; changeHref: string }
  | { kind: "india"; changeHref: string; backHref: string };

/**
 * changeHref is the no-JS target of "Change" / "Pick a city" (the page's
 * own city list); backHref is the page path without a query, which the
 * proxy rewrites back to the visitor's city.
 */
export function cityLineFor(scope: CityScope, changeHref: string, backHref: string): CityLineProps {
  if (scope.kind === "city") {
    if (scope.requested) {
      return {
        kind: "fallback",
        requestedLabel: scope.requested.label,
        showing: { label: scope.label, km: scope.requested.km },
        changeHref,
      };
    }
    return { kind: "city", label: scope.label, changeHref };
  }
  if (scope.requested) return { kind: "fallback", requestedLabel: scope.requested.label, showing: null, changeHref };
  return { kind: "india", changeHref, backHref };
}
