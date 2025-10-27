/**
 * Availability Prediction Logic
 * Based on: rating, total reviews, time of day, day of week
 */

export interface AvailabilityPrediction {
  likelihood: 'high' | 'medium' | 'low';
  message: string;
  color: string;
  icon: string;
}

export function predictAvailability(
  rating: number,
  totalReviews: number,
  checkTime?: 'day' | 'night',
  checkDay?: 'weekday' | 'weekend'
): AvailabilityPrediction {
  // Get current time info if not provided
  const now = new Date();
  const currentHour = now.getHours();
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;

  const timeOfDay = checkTime || (currentHour >= 6 && currentHour < 18 ? 'day' : 'night');
  const dayType = checkDay || (isWeekend ? 'weekend' : 'weekday');

  // Calculate popularity score (0-100)
  const popularityScore = calculatePopularityScore(rating, totalReviews);

  // Weekend + Night = highest demand
  if (dayType === 'weekend' && timeOfDay === 'night') {
    if (popularityScore >= 70) {
      return {
        likelihood: 'low',
        message: 'Usually booked on weekend evenings',
        color: 'text-red-600',
        icon: '🔴'
      };
    } else if (popularityScore >= 40) {
      return {
        likelihood: 'medium',
        message: 'Limited availability on weekend evenings',
        color: 'text-orange-600',
        icon: '🟠'
      };
    } else {
      return {
        likelihood: 'medium',
        message: 'Likely available on weekend evenings',
        color: 'text-orange-600',
        icon: '🟠'
      };
    }
  }

  // Weekend + Day = moderate demand
  if (dayType === 'weekend' && timeOfDay === 'day') {
    if (popularityScore >= 70) {
      return {
        likelihood: 'medium',
        message: 'Moderate availability on weekends',
        color: 'text-orange-600',
        icon: '🟠'
      };
    } else {
      return {
        likelihood: 'high',
        message: 'Usually available on weekends',
        color: 'text-green-600',
        icon: '🟢'
      };
    }
  }

  // Weekday + Night = moderate-high demand
  if (dayType === 'weekday' && timeOfDay === 'night') {
    if (popularityScore >= 80) {
      return {
        likelihood: 'medium',
        message: 'Popular on weekday evenings',
        color: 'text-orange-600',
        icon: '🟠'
      };
    } else {
      return {
        likelihood: 'high',
        message: 'Usually available on weekday evenings',
        color: 'text-green-600',
        icon: '🟢'
      };
    }
  }

  // Weekday + Day = lowest demand (most available)
  if (dayType === 'weekday' && timeOfDay === 'day') {
    return {
      likelihood: 'high',
      message: 'Usually available during weekday daytime',
      color: 'text-green-600',
      icon: '🟢'
    };
  }

  // Default fallback
  return {
    likelihood: 'medium',
    message: 'Contact owner for availability',
    color: 'text-gray-600',
    icon: '⚪'
  };
}

/**
 * Calculate popularity score based on rating and review count
 * Returns a score from 0-100
 */
function calculatePopularityScore(rating: number, totalReviews: number): number {
  // Rating contribution (0-50 points)
  // 5 stars = 50, 4 stars = 40, 3 stars = 30, etc.
  const ratingScore = (rating / 5) * 50;

  // Review count contribution (0-50 points)
  // More reviews = more popular
  // 100+ reviews = 50 points, scales down from there
  const reviewScore = Math.min((totalReviews / 100) * 50, 50);

  return ratingScore + reviewScore;
}

/**
 * Get availability summary for display
 */
export function getAvailabilitySummary(
  rating: number,
  totalReviews: number
): string {
  const weekdayDay = predictAvailability(rating, totalReviews, 'day', 'weekday');
  const weekendNight = predictAvailability(rating, totalReviews, 'night', 'weekend');

  if (weekdayDay.likelihood === 'high' && weekendNight.likelihood === 'low') {
    return 'Best availability on weekday mornings';
  } else if (weekendNight.likelihood === 'low') {
    return 'Book early for weekend evenings';
  } else if (weekdayDay.likelihood === 'high') {
    return 'Great availability throughout the week';
  } else {
    return 'Contact for current availability';
  }
}
