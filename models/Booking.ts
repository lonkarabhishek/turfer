import { BaseModel } from './BaseModel';
import { Booking as BookingType } from '../types';

export class BookingModel extends BaseModel {
  async create(bookingData: Omit<BookingType, 'id' | 'createdAt' | 'updatedAt'>): Promise<BookingType> {
    const id = this.generateId();
    
    const sql = `
      INSERT INTO bookings (
        id, user_id, turf_id, date, start_time, end_time, 
        total_players, total_amount, status, notes, 
        payment_status, payment_method
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.db.run(sql, [
      id,
      bookingData.userId,
      bookingData.turfId,
      bookingData.date,
      bookingData.startTime,
      bookingData.endTime,
      bookingData.totalPlayers,
      bookingData.totalAmount,
      bookingData.status,
      bookingData.notes || null,
      bookingData.paymentStatus,
      bookingData.paymentMethod || null
    ]);

    return this.findById(id) as Promise<BookingType>;
  }

  async findById(id: string): Promise<BookingType | null> {
    const sql = 'SELECT * FROM bookings WHERE id = ?';
    const row = await this.db.get(sql, [id]);
    
    return row ? this.mapRowToBooking(row) : null;
  }

  async findByUserId(userId: string, filters: { status?: string; limit?: number } = {}): Promise<BookingType[]> {
    let sql = 'SELECT * FROM bookings WHERE user_id = ?';
    const params: any[] = [userId];

    if (filters.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }

    sql += ' ORDER BY created_at DESC';

    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }

    const rows = await this.db.all(sql, params);
    return rows.map(this.mapRowToBooking);
  }

  async findByTurfId(turfId: string, filters: { date?: string; status?: string } = {}): Promise<BookingType[]> {
    let sql = 'SELECT * FROM bookings WHERE turf_id = ?';
    const params: any[] = [turfId];

    if (filters.date) {
      sql += ' AND date = ?';
      params.push(filters.date);
    }

    if (filters.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }

    sql += ' ORDER BY date ASC, start_time ASC';

    const rows = await this.db.all(sql, params);
    return rows.map(this.mapRowToBooking);
  }

  async checkAvailability(turfId: string, date: string, startTime: string, endTime: string, excludeBookingId?: string): Promise<boolean> {
    let sql = `
      SELECT COUNT(*) as count 
      FROM bookings 
      WHERE turf_id = ? 
      AND date = ? 
      AND status IN ('pending', 'confirmed') 
      AND (
        (start_time < ? AND end_time > ?) OR
        (start_time < ? AND end_time > ?) OR
        (start_time >= ? AND start_time < ?)
      )
    `;
    
    const params = [turfId, date, endTime, startTime, startTime, endTime, startTime, endTime];

    if (excludeBookingId) {
      sql += ' AND id != ?';
      params.push(excludeBookingId);
    }

    const result = await this.db.get(sql, params);
    return (result?.count || 0) === 0;
  }

  async getAvailableSlots(turfId: string, date: string): Promise<string[]> {
    const sql = `
      SELECT start_time, end_time 
      FROM bookings 
      WHERE turf_id = ? 
      AND date = ? 
      AND status IN ('pending', 'confirmed')
      ORDER BY start_time ASC
    `;
    
    const bookedSlots = await this.db.all(sql, [turfId, date]);
    
    // Generate available slots (simplified - you might want to fetch from turf operating hours)
    const allSlots = this.generateTimeSlots('06:00', '23:00', 60); // 6 AM to 11 PM, 1-hour slots
    
    return allSlots.filter(slot => {
      const [startTime] = slot.split(' - ');
      return !bookedSlots.some(booking => 
        startTime >= booking.start_time && startTime < booking.end_time
      );
    });
  }

  async update(id: string, updates: Partial<Omit<BookingType, 'id' | 'createdAt' | 'updatedAt'>>): Promise<BookingType | null> {
    const updateData: any = {};
    
    if (updates.date) updateData.date = updates.date;
    if (updates.startTime) updateData.start_time = updates.startTime;
    if (updates.endTime) updateData.end_time = updates.endTime;
    if (updates.totalPlayers) updateData.total_players = updates.totalPlayers;
    if (updates.totalAmount) updateData.total_amount = updates.totalAmount;
    if (updates.status) updateData.status = updates.status;
    if (updates.notes !== undefined) updateData.notes = updates.notes;
    if (updates.paymentStatus) updateData.payment_status = updates.paymentStatus;
    if (updates.paymentMethod !== undefined) updateData.payment_method = updates.paymentMethod;

    const { set, params } = this.buildUpdateClause(updateData);
    
    if (!set) return this.findById(id);
    
    const sql = `UPDATE bookings SET ${set} WHERE id = ?`;
    await this.db.run(sql, [...params, id]);
    
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const sql = 'DELETE FROM bookings WHERE id = ?';
    const result = await this.db.run(sql, [id]);
    return result.changes > 0;
  }

  async getBookingStats(filters: { ownerId?: string; turfId?: string; dateFrom?: string; dateTo?: string } = {}): Promise<any> {
    let sql = `
      SELECT 
        COUNT(*) as total_bookings,
        SUM(CASE WHEN status = 'completed' THEN total_amount ELSE 0 END) as total_revenue,
        AVG(total_amount) as avg_booking_value,
        COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_bookings,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_bookings
      FROM bookings b
    `;
    
    const params: any[] = [];
    const conditions: string[] = [];

    if (filters.turfId) {
      conditions.push('b.turf_id = ?');
      params.push(filters.turfId);
    } else if (filters.ownerId) {
      sql += ' JOIN turfs t ON b.turf_id = t.id';
      conditions.push('t.owner_id = ?');
      params.push(filters.ownerId);
    }

    if (filters.dateFrom) {
      conditions.push('b.date >= ?');
      params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      conditions.push('b.date <= ?');
      params.push(filters.dateTo);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    return this.db.get(sql, params);
  }

  private generateTimeSlots(startTime: string, endTime: string, durationMinutes: number): string[] {
    const slots: string[] = [];
    let current = this.timeToMinutes(startTime);
    const end = this.timeToMinutes(endTime);

    while (current < end) {
      const start = this.minutesToTime(current);
      const finish = this.minutesToTime(current + durationMinutes);
      slots.push(`${start} - ${finish}`);
      current += durationMinutes;
    }

    return slots;
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  private mapRowToBooking(row: any): BookingType {
    return {
      id: row.id,
      userId: row.user_id,
      turfId: row.turf_id,
      date: row.date,
      startTime: row.start_time,
      endTime: row.end_time,
      totalPlayers: row.total_players,
      totalAmount: row.total_amount,
      status: row.status,
      notes: row.notes,
      paymentStatus: row.payment_status,
      paymentMethod: row.payment_method,
      createdAt: this.parseDateTime(row.created_at),
      updatedAt: this.parseDateTime(row.updated_at)
    };
  }
}