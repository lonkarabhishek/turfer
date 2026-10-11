/**
 * Cricket overs, done properly. "5.3" is five overs and three balls,
 * 33 legal deliveries, not 5.3 overs of six. Everything in the cricket
 * tools goes through balls so run rates and NRR come out right.
 */

export const BALLS_PER_OVER = 6;

export type ParsedOvers = { ok: true; balls: number } | { ok: false; error: string };

/**
 * "4", "4.0", "4.5", "12.3" -> legal ball count. The digit after the
 * point is balls, so it must be 0 to 5. Rejects "4.6", "4.7", "4.10",
 * negatives and anything that is not a number.
 */
export function parseOvers(input: string | number | null | undefined): ParsedOvers {
  const raw = String(input ?? "").trim();
  if (raw === "") return { ok: false, error: "Enter overs, like 6 or 5.3" };
  const m = raw.match(/^(\d{1,3})(?:\.(\d))?$/);
  if (!m) {
    if (/^\d{1,3}\.\d{2,}$/.test(raw)) return { ok: false, error: "Only one digit after the point: the balls, 0 to 5" };
    return { ok: false, error: "Overs look like 6 or 5.3" };
  }
  const overs = Number(m[1]);
  const balls = m[2] === undefined ? 0 : Number(m[2]);
  if (balls > 5) return { ok: false, error: `${raw} is not valid: an over has 6 balls, so the last digit is 0 to 5` };
  return { ok: true, balls: overs * BALLS_PER_OVER + balls };
}

/** Whole overs and balls to legal deliveries. */
export function toBalls(overs: number, balls = 0): number {
  return overs * BALLS_PER_OVER + balls;
}

/** Legal deliveries to decimal overs for run-rate maths (33 balls -> 5.5). */
export function ballsToDecimalOvers(balls: number): number {
  return balls / BALLS_PER_OVER;
}

/** Legal deliveries to cricket notation (33 -> "5.3"). */
export function formatOvers(balls: number): string {
  const b = Math.max(0, Math.round(balls));
  const whole = Math.floor(b / BALLS_PER_OVER);
  const rem = b % BALLS_PER_OVER;
  return rem === 0 ? `${whole}.0` : `${whole}.${rem}`;
}

/** Runs per over, or null when no ball has been bowled. */
export function runRate(runs: number, balls: number): number | null {
  if (!Number.isFinite(runs) || !Number.isFinite(balls) || balls <= 0) return null;
  return runs / ballsToDecimalOvers(balls);
}

export function formatRate(rate: number | null, digits = 2): string {
  return rate == null ? "0.00" : rate.toFixed(digits);
}

/** "+1.500" or "-0.250" */
export function formatNrr(nrr: number | null, digits = 3): string {
  if (nrr == null) return "0.000";
  const fixed = Math.abs(nrr).toFixed(digits);
  if (Number(fixed) === 0) return `+${fixed}`;
  return `${nrr < 0 ? "-" : "+"}${fixed}`;
}
