import type { Turf } from "@/types/turf";

/**
 * Gets the minimum price across all pricing fields
 */
export function getMinimumPrice(turf: Turf): number {
  const prices = [
    turf.morning_price,
    turf.afternoon_price,
    turf.evening_price,
    turf.weekend_morning_price,
    turf.weekend_afternoon_price,
    turf.weekend_evening_price,
  ].filter((p): p is number => p !== null && p !== undefined && p > 0);

  return prices.length > 0 ? Math.min(...prices) : 500;
}

/**
 * Gets the maximum price across all pricing fields
 */
export function getMaximumPrice(turf: Turf): number {
  const prices = [
    turf.morning_price,
    turf.afternoon_price,
    turf.evening_price,
    turf.weekend_morning_price,
    turf.weekend_afternoon_price,
    turf.weekend_evening_price,
  ].filter((p): p is number => p !== null && p !== undefined && p > 0);

  return prices.length > 0 ? Math.max(...prices) : 800;
}

/**
 * Formats a price as "Rs X"
 */
export function formatPrice(price: number | null | undefined): string {
  if (!price || price <= 0) return "N/A";
  return `₹${price}`;
}
