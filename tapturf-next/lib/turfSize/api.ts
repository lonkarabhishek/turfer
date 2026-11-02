import type { Ground, GroundSizes, InputProblem, Unit } from "./sizes";

// /api/my/ground-sizes, what the owner's form sends and gets back
// (lib/my/groundSizes.ts has the handlers). Every call carries the sign-in
// token; the server works out the account and asks the database whether
// it runs the turf.

/** GET ?turf=<id>. ready false: the database has no ground sizes yet (the form says "coming soon"). */
export type GroundSizesState =
  | { ready: false }
  | {
      ready: true;
      sizes: GroundSizes | null;
      /** The size TapTurf's research found (length_feet...), offered to check; never saved for the owner. */
      legacy: Ground | null;
      saves_left: number;
    };

/** POST: the grounds as typed (numbers or the boxes' text), in `unit`. An empty list takes the sizes off. */
export type GroundSizesBody = {
  turf_id: string;
  unit: Unit;
  grounds: { name?: string | null; sport?: string | null; length?: number | string | null; width?: number | string | null; height?: number | string | null }[];
};

export type GroundSizesSaved = { r: "ok"; changed: boolean; sizes: GroundSizes | null; saves_left: number };

/**
 * Refusals, as { error, reason?, problem? }: bad (problem names the
 * ground and box), not_owner (403), gone (404: not listed), limit (429:
 * 20 saves today), not_ready (503: before the database has them),
 * sign_in, slow, unavailable.
 */
export type GroundSizesError = { error: string; reason?: "not_owner" | "gone" | "limit" | "not_ready"; problem?: InputProblem };
