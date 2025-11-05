/**
 * Utility functions for price formatting and validation
 */

export interface PriceData {
  pricePerHour?: number;
  pricePerHourWeekend?: number;
  priceMin?: number;
  priceMax?: number;
  morning_price?: number;
  afternoon_price?: number;
  evening_price?: number;
  weekend_morning_price?: number;
  weekend_afternoon_price?: number;
  weekend_evening_price?: number;
}

/**
 * Format price display string with fallbacks
 * @param price - Primary price per hour
 * @param weekendPrice - Weekend price (optional)
 * @param defaultPrice - Default fallback price (default: 500)
 * @returns Formatted price string like "₹500/hr" or "₹500-₹600/hr"
 */
export const formatPriceDisplay = (
  price?: number,
  weekendPrice?: number,
  defaultPrice: number = 500
): string => {
  const safePrice = price && price > 0 ? price : defaultPrice;

  if (weekendPrice && weekendPrice > 0 && weekendPrice !== safePrice) {
    return `₹${safePrice}–₹${weekendPrice}/hr`;
  }

  return `₹${safePrice}/hr`;
};

/**
 * Get safe price value with fallback
 * @param price - Price value that might be undefined
 * @param defaultPrice - Default fallback price (default: 500)
 * @returns Safe price number
 */
export const getSafePrice = (price?: number, defaultPrice: number = 500): number => {
  return price && price > 0 ? price : defaultPrice;
};

/**
 * Validate and clean price data from API
 * @param priceData - Raw price data from API
 * @returns Cleaned price data with fallbacks
 */
export const cleanPriceData = (priceData: Partial<PriceData>): PriceData => {
  return {
    pricePerHour: getSafePrice(priceData.pricePerHour),
    pricePerHourWeekend: priceData.pricePerHourWeekend && priceData.pricePerHourWeekend > 0
      ? priceData.pricePerHourWeekend
      : undefined,
    priceMin: priceData.priceMin && priceData.priceMin > 0 ? priceData.priceMin : undefined,
    priceMax: priceData.priceMax && priceData.priceMax > 0 ? priceData.priceMax : undefined
  };
};

/**
 * Get minimum price from all available price fields
 * @param priceData - Object containing various price fields
 * @param defaultPrice - Default fallback price (default: 500)
 * @returns Minimum price found or default
 */
export const getMinimumPrice = (priceData: any, defaultPrice: number = 500): number => {
  const prices = [
    priceData?.morning_price,
    priceData?.afternoon_price,
    priceData?.evening_price,
    priceData?.weekend_morning_price,
    priceData?.weekend_afternoon_price,
    priceData?.weekend_evening_price,
    priceData?.pricePerHour,
    priceData?.priceMin
  ].filter(p => p != null && p > 0);

  return prices.length > 0 ? Math.min(...prices) : defaultPrice;
};

/**
 * Format price display with minimum price (Starting From format)
 * @param priceData - Object containing various price fields
 * @param defaultPrice - Default fallback price (default: 500)
 * @returns Formatted price string like "Starting ₹500"
 */
export const formatStartingPrice = (priceData: any, defaultPrice: number = 500): string => {
  const minPrice = getMinimumPrice(priceData, defaultPrice);
  return `Starting ₹${minPrice}`;
};

/**
 * Format booking price summary
 * @param duration - Duration in hours
 * @param pricePerHour - Price per hour
 * @param isWeekend - Whether it's weekend pricing
 * @param weekendPrice - Weekend price per hour
 * @returns Formatted price summary
 */
export const formatBookingPrice = (
  duration: number,
  pricePerHour: number,
  isWeekend: boolean = false,
  weekendPrice?: number
): { basePrice: number; totalPrice: number; priceLabel: string } => {
  const effectivePrice = isWeekend && weekendPrice ? weekendPrice : pricePerHour;
  const basePrice = getSafePrice(effectivePrice);
  const totalPrice = basePrice * duration;

  const priceLabel = `${duration} hr${duration > 1 ? 's' : ''} × ₹${basePrice}`;

  return {
    basePrice,
    totalPrice,
    priceLabel
  };
};