/**
 * Enhanced booking utilities for slot management and double-booking prevention
 */

export interface SlotBooking {
  turfId: string;
  date: string;
  startTime: string;
  endTime: string;
  userId?: string;
  status: 'available' | 'locked' | 'booked' | 'expired';
  lockedAt?: Date;
  expiresAt?: Date;
}

export interface BookingValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate booking time slots
 */
export const validateBookingSlot = (
  date: string,
  startTime: string,
  endTime: string,
  existingBookings: SlotBooking[] = []
): BookingValidation => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Parse times
  const start = parseTime(startTime);
  const end = parseTime(endTime);
  const bookingDate = new Date(date);
  const today = new Date();

  // Basic validation
  if (!start || !end) {
    errors.push('Invalid time format. Please use HH:MM format.');
    return { isValid: false, errors, warnings };
  }

  if (start >= end) {
    errors.push('End time must be after start time.');
  }

  if (end - start < 1) {
    errors.push('Minimum booking duration is 1 hour.');
  }

  if (end - start > 8) {
    warnings.push('Long booking duration. Consider breaking into smaller slots.');
  }

  // Date validation
  today.setHours(0, 0, 0, 0);
  bookingDate.setHours(0, 0, 0, 0);

  if (bookingDate < today) {
    errors.push('Cannot book slots for past dates.');
  }

  // Check if booking is too far in the future
  const maxAdvanceDays = 30;
  const maxAdvanceDate = new Date();
  maxAdvanceDate.setDate(maxAdvanceDate.getDate() + maxAdvanceDays);
  if (bookingDate > maxAdvanceDate) {
    errors.push(`Cannot book more than ${maxAdvanceDays} days in advance.`);
  }

  // Check for conflicts with existing bookings
  const hasConflict = existingBookings.some(booking => {
    if (booking.date !== date) return false;

    const bookingStart = parseTime(booking.startTime);
    const bookingEnd = parseTime(booking.endTime);

    if (!bookingStart || !bookingEnd) return false;

    // Check for overlap
    return (start < bookingEnd && end > bookingStart);
  });

  if (hasConflict) {
    errors.push('This time slot conflicts with an existing booking.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * Parse time string to hours (e.g., "14:30" -> 14.5)
 */
function parseTime(timeStr: string): number | null {
  if (!timeStr) return null;

  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return hours + minutes / 60;
}

/**
 * Generate available time slots for a date
 */
export const generateAvailableSlots = (
  date: string,
  existingBookings: SlotBooking[] = [],
  operatingHours = { start: 6, end: 23 }
): { time: string; available: boolean; locked: boolean; price: number }[] => {
  const slots = [];
  const today = new Date();
  const slotDate = new Date(date);
  const isToday = slotDate.toDateString() === today.toDateString();

  for (let hour = operatingHours.start; hour < operatingHours.end; hour++) {
    const timeSlot = `${hour.toString().padStart(2, '0')}:00`;
    const nextHour = `${(hour + 1).toString().padStart(2, '0')}:00`;

    // Skip past slots if it's today
    if (isToday && hour <= today.getHours()) {
      continue;
    }

    // Check if slot is booked or locked
    const existingBooking = existingBookings.find(booking =>
      booking.date === date &&
      booking.startTime === timeSlot
    );

    const available = !existingBooking || existingBooking.status === 'available';
    const locked = existingBooking?.status === 'locked';

    // Dynamic pricing (weekend/peak hour pricing)
    const isWeekend = slotDate.getDay() === 0 || slotDate.getDay() === 6;
    const isPeakHour = hour >= 18 && hour <= 21;
    const basePrice = 500;
    const weekendMultiplier = isWeekend ? 1.2 : 1;
    const peakMultiplier = isPeakHour ? 1.3 : 1;

    slots.push({
      time: `${timeSlot}-${nextHour}`,
      available,
      locked,
      price: Math.round(basePrice * weekendMultiplier * peakMultiplier)
    });
  }

  return slots;
};

/**
 * Lock a slot temporarily during booking process
 */
export const lockSlot = (
  turfId: string,
  date: string,
  startTime: string,
  endTime: string,
  userId: string,
  lockDurationMinutes = 10
): SlotBooking => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + lockDurationMinutes * 60000);

  return {
    turfId,
    date,
    startTime,
    endTime,
    userId,
    status: 'locked',
    lockedAt: now,
    expiresAt
  };
};

/**
 * Check if a slot lock has expired
 */
export const isSlotLockExpired = (slot: SlotBooking): boolean => {
  if (slot.status !== 'locked' || !slot.expiresAt) return false;
  return new Date() > slot.expiresAt;
};

/**
 * Clean up expired slot locks
 */
export const cleanupExpiredLocks = (bookings: SlotBooking[]): SlotBooking[] => {
  return bookings.map(booking => {
    if (isSlotLockExpired(booking)) {
      return { ...booking, status: 'available', lockedAt: undefined, expiresAt: undefined };
    }
    return booking;
  });
};

/**
 * Calculate booking total with taxes and fees
 */
export const calculateBookingTotal = (
  baseAmount: number,
  options: {
    platformFeePercent?: number;
    gstPercent?: number;
    processingFeePercent?: number;
  } = {}
): {
  baseAmount: number;
  platformFee: number;
  gst: number;
  processingFee: number;
  totalAmount: number;
} => {
  const {
    platformFeePercent = 2.5,
    gstPercent = 18,
    processingFeePercent = 2.0
  } = options;

  const platformFee = Math.round(baseAmount * (platformFeePercent / 100));
  const subtotal = baseAmount + platformFee;
  const gst = Math.round(subtotal * (gstPercent / 100));
  const processingFee = Math.round(baseAmount * (processingFeePercent / 100));

  const totalAmount = baseAmount + platformFee + gst + processingFee;

  return {
    baseAmount,
    platformFee,
    gst,
    processingFee,
    totalAmount
  };
};