import { SupabaseModel } from './SupabaseModel';
import { Booking as BookingType } from '../types';

export class BookingModel extends SupabaseModel {
  protected tableName = 'bookings';

  async create(bookingData: Omit<BookingType, 'id' | 'createdAt' | 'updatedAt'>): Promise<BookingType> {
    const data = {
      id: this.generateId(),
      user_id: bookingData.userId,
      turf_id: bookingData.turfId,
      date: bookingData.date,
      start_time: bookingData.startTime,
      end_time: bookingData.endTime,
      total_players: bookingData.totalPlayers,
      total_amount: bookingData.totalAmount,
      status: bookingData.status,
      notes: bookingData.notes,
      payment_status: bookingData.paymentStatus,
      payment_method: bookingData.paymentMethod
    };

    const result = await super.create(data);
    return this.mapRowToBooking(result);
  }

  async findById(id: string): Promise<BookingType | null> {
    const row = await super.findById(id);
    return row ? this.mapRowToBooking(row) : null;
  }

  async findByUserId(userId: string): Promise<BookingType[]> {
    const { data, error } = await this.db
      .from(this.tableName)
      .select(`
        *,
        turfs (
          name,
          address
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    return (data || []).map(row => {
      const booking = this.mapRowToBooking(row);
      if (row.turfs) {
        (booking as any).turf_name = row.turfs.name;
        (booking as any).turf_address = row.turfs.address;
      }
      return booking;
    });
  }

  async findByTurfId(turfId: string): Promise<BookingType[]> {
    const { data, error } = await this.db
      .from(this.tableName)
      .select(`
        *,
        users (
          name,
          email
        )
      `)
      .eq('turf_id', turfId)
      .order('date', { ascending: false });

    if (error) throw error;
    
    return (data || []).map(row => {
      const booking = this.mapRowToBooking(row);
      if (row.users) {
        (booking as any).user_name = row.users.name;
        (booking as any).user_email = row.users.email;
      }
      return booking;
    });
  }

  async update(id: string, updates: Partial<Omit<BookingType, 'id' | 'createdAt' | 'updatedAt'>>): Promise<BookingType | null> {
    const updateData: any = {};
    
    if (updates.status) updateData.status = updates.status;
    if (updates.notes !== undefined) updateData.notes = updates.notes;
    if (updates.paymentStatus) updateData.payment_status = updates.paymentStatus;
    if (updates.paymentMethod) updateData.payment_method = updates.paymentMethod;
    if (updates.totalAmount !== undefined) updateData.total_amount = updates.totalAmount;

    const result = await super.update(id, updateData);
    return result ? this.mapRowToBooking(result) : null;
  }

  async findConflictingBookings(turfId: string, date: string, startTime: string, endTime: string): Promise<BookingType[]> {
    const { data, error } = await this.db
      .from(this.tableName)
      .select('*')
      .eq('turf_id', turfId)
      .eq('date', date)
      .in('status', ['pending', 'confirmed'])
      .or(`and(start_time.lte.${startTime},end_time.gt.${startTime}),and(start_time.lt.${endTime},end_time.gte.${endTime}),and(start_time.gte.${startTime},end_time.lte.${endTime})`);

    if (error) throw error;
    
    return (data || []).map(this.mapRowToBooking);
  }

  async checkAvailability(turfId: string, date: string, startTime: string, endTime: string): Promise<boolean> {
    const conflicting = await this.findConflictingBookings(turfId, date, startTime, endTime);
    return conflicting.length === 0;
  }

  async getAvailableSlots(turfId: string, date: string): Promise<{ startTime: string; endTime: string }[]> {
    // Get all bookings for the day
    const { data, error } = await this.db
      .from(this.tableName)
      .select('start_time, end_time')
      .eq('turf_id', turfId)
      .eq('date', date)
      .in('status', ['pending', 'confirmed'])
      .order('start_time');

    if (error) throw error;

    // Generate available slots (simplified logic)
    const bookedSlots = (data || []).map(booking => ({
      startTime: booking.start_time,
      endTime: booking.end_time
    }));

    // Return all day slots minus booked ones (simplified)
    const allSlots = [];
    for (let hour = 6; hour < 23; hour++) {
      const startTime = `${hour.toString().padStart(2, '0')}:00`;
      const endTime = `${(hour + 1).toString().padStart(2, '0')}:00`;
      
      const isBooked = bookedSlots.some(booked => 
        (startTime >= booked.startTime && startTime < booked.endTime) ||
        (endTime > booked.startTime && endTime <= booked.endTime) ||
        (startTime <= booked.startTime && endTime >= booked.endTime)
      );

      if (!isBooked) {
        allSlots.push({ startTime, endTime });
      }
    }

    return allSlots;
  }

  private mapRowToBooking = (row: any): BookingType => {
    return {
      id: row.id,
      userId: row.user_id,
      turfId: row.turf_id,
      date: row.date,
      startTime: row.start_time,
      endTime: row.end_time,
      totalPlayers: row.total_players,
      totalAmount: parseFloat(row.total_amount),
      status: row.status,
      notes: row.notes,
      paymentStatus: row.payment_status,
      paymentMethod: row.payment_method,
      createdAt: this.parseDateTime(row.created_at),
      updatedAt: this.parseDateTime(row.updated_at)
    };
  };
}