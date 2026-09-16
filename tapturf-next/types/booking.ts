// Bookings are the real venue-reservation loop (distinct from `games`,
// which are player-organised open matches). Shape mirrors the
// public.bookings table added in the recent DB migration.

export type BookingStatus = "pending" | "confirmed" | "cancelled" | "completed";
export type PaymentStatus = "pending" | "paid" | "refunded";
export type PaymentMethod = "cash" | "online" | "wallet";

export interface Booking {
  id: string;
  user_id: string;
  turf_id: string;
  date: string;               // YYYY-MM-DD
  start_time: string;         // HH:MM:SS
  end_time: string;           // HH:MM:SS
  total_players: number;
  total_amount: number;
  status: BookingStatus;
  notes: string | null;
  payment_status: PaymentStatus | null;
  payment_method: PaymentMethod | null;
  created_at: string | null;
  updated_at: string | null;
}
