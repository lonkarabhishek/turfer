import { BaseModel } from './BaseModel';
import { Turf as TurfType, SearchQuery } from '../types';

export class TurfModel extends BaseModel {
  async create(turfData: Omit<TurfType, 'id' | 'createdAt' | 'updatedAt'>): Promise<TurfType> {
    const id = this.generateId();
    
    const sql = `
      INSERT INTO turfs (
        id, owner_id, name, address, lat, lng, description, 
        sports, amenities, images, price_per_hour, price_per_hour_weekend,
        operating_hours, contact_info, rating, total_reviews, is_active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.db.run(sql, [
      id,
      turfData.ownerId,
      turfData.name,
      turfData.address,
      turfData.coordinates?.lat || null,
      turfData.coordinates?.lng || null,
      turfData.description || null,
      this.stringifyJsonField(turfData.sports),
      this.stringifyJsonField(turfData.amenities),
      this.stringifyJsonField(turfData.images),
      turfData.pricePerHour,
      turfData.pricePerHourWeekend || null,
      this.stringifyJsonField(turfData.operatingHours),
      this.stringifyJsonField(turfData.contactInfo),
      turfData.rating,
      turfData.totalReviews,
      turfData.isActive ? 1 : 0
    ]);

    return this.findById(id) as Promise<TurfType>;
  }

  async findById(id: string): Promise<TurfType | null> {
    const sql = 'SELECT * FROM turfs WHERE id = ?';
    const row = await this.db.get(sql, [id]);
    
    return row ? this.mapRowToTurf(row) : null;
  }

  async findByOwnerId(ownerId: string): Promise<TurfType[]> {
    const sql = 'SELECT * FROM turfs WHERE owner_id = ? ORDER BY created_at DESC';
    const rows = await this.db.all(sql, [ownerId]);
    
    return rows.map(row => this.mapRowToTurf(row));
  }

  async search(query: SearchQuery): Promise<{ turfs: TurfType[]; total: number }> {
    let sql = `
      SELECT * FROM turfs 
      WHERE is_active = 1
    `;
    
    const params: any[] = [];
    const conditions: string[] = [];

    if (query.query) {
      conditions.push('(name LIKE ? OR address LIKE ? OR description LIKE ?)');
      const searchTerm = `%${query.query}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (query.sport) {
      conditions.push('sports LIKE ?');
      params.push(`%"${query.sport}"%`);
    }

    if (query.priceMin !== undefined) {
      conditions.push('price_per_hour >= ?');
      params.push(query.priceMin);
    }

    if (query.priceMax !== undefined) {
      conditions.push('price_per_hour <= ?');
      params.push(query.priceMax);
    }

    if (query.rating !== undefined) {
      conditions.push('rating >= ?');
      params.push(query.rating);
    }

    if (query.amenities && query.amenities.length > 0) {
      const amenityConditions = query.amenities.map(() => 'amenities LIKE ?');
      conditions.push(`(${amenityConditions.join(' AND ')})`);
      query.amenities.forEach(amenity => {
        params.push(`%"${amenity}"%`);
      });
    }

    if (conditions.length > 0) {
      sql += ` AND ${conditions.join(' AND ')}`;
    }

    // Add sorting
    const sortField = this.mapSortField(query.sort || 'rating');
    const sortOrder = query.order === 'asc' ? 'ASC' : 'DESC';
    sql += ` ORDER BY ${sortField} ${sortOrder}`;

    // Get total count for pagination
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count');
    const countResult = await this.db.get(countSql, params);
    const total = countResult?.count || 0;

    // Add pagination
    const page = query.page || 1;
    const limit = query.limit || 10;
    const offset = (page - 1) * limit;
    sql += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = await this.db.all(sql, params);
    const turfs = rows.map((row) => this.mapRowToTurf(row));

    return { turfs, total };
  }

  async findNearby(lat: number, lng: number, radius: number = 10): Promise<TurfType[]> {
    // Simple distance calculation using Haversine formula approximation
    const sql = `
      SELECT *, (
        6371 * acos(
          cos(radians(?)) * 
          cos(radians(lat)) * 
          cos(radians(lng) - radians(?)) + 
          sin(radians(?)) * 
          sin(radians(lat))
        )
      ) AS distance 
      FROM turfs 
      WHERE is_active = 1 
      AND lat IS NOT NULL 
      AND lng IS NOT NULL
      HAVING distance <= ?
      ORDER BY distance ASC
    `;
    
    const rows = await this.db.all(sql, [lat, lng, lat, radius]);
    return rows.map(row => this.mapRowToTurf(row));
  }

  async update(id: string, updates: Partial<Omit<TurfType, 'id' | 'createdAt' | 'updatedAt'>>): Promise<TurfType | null> {
    const updateData: any = {};
    
    if (updates.name) updateData.name = updates.name;
    if (updates.address) updateData.address = updates.address;
    if (updates.coordinates) {
      updateData.lat = updates.coordinates.lat;
      updateData.lng = updates.coordinates.lng;
    }
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.sports) updateData.sports = this.stringifyJsonField(updates.sports);
    if (updates.amenities) updateData.amenities = this.stringifyJsonField(updates.amenities);
    if (updates.images) updateData.images = this.stringifyJsonField(updates.images);
    if (updates.pricePerHour) updateData.price_per_hour = updates.pricePerHour;
    if (updates.pricePerHourWeekend !== undefined) updateData.price_per_hour_weekend = updates.pricePerHourWeekend;
    if (updates.operatingHours) updateData.operating_hours = this.stringifyJsonField(updates.operatingHours);
    if (updates.contactInfo) updateData.contact_info = this.stringifyJsonField(updates.contactInfo);
    if (updates.rating !== undefined) updateData.rating = updates.rating;
    if (updates.totalReviews !== undefined) updateData.total_reviews = updates.totalReviews;
    if (updates.isActive !== undefined) updateData.is_active = updates.isActive ? 1 : 0;

    const { set, params } = this.buildUpdateClause(updateData);
    
    if (!set) return this.findById(id);
    
    const sql = `UPDATE turfs SET ${set} WHERE id = ?`;
    await this.db.run(sql, [...params, id]);
    
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const sql = 'DELETE FROM turfs WHERE id = ?';
    const result = await this.db.run(sql, [id]);
    return result.changes > 0;
  }

  async updateRating(turfId: string) {
    const sql = `
      UPDATE turfs 
      SET rating = (
        SELECT COALESCE(AVG(rating), 0) FROM reviews WHERE turf_id = ?
      ),
      total_reviews = (
        SELECT COUNT(*) FROM reviews WHERE turf_id = ?
      )
      WHERE id = ?
    `;
    
    await this.db.run(sql, [turfId, turfId, turfId]);
  }

  private mapSortField(sort: string): string {
    const fieldMap: Record<string, string> = {
      'name': 'name',
      'price': 'price_per_hour',
      'rating': 'rating',
      'created': 'created_at'
    };
    
    return fieldMap[sort] || 'rating';
  }

  private mapRowToTurf(row: any): TurfType {
    return {
      id: row.id,
      ownerId: row.owner_id,
      name: row.name,
      address: row.address,
      coordinates: row.lat && row.lng ? { lat: row.lat, lng: row.lng } : undefined,
      description: row.description,
      sports: this.parseJsonField(row.sports) || [],
      amenities: this.parseJsonField(row.amenities) || [],
      images: this.parseJsonField(row.images) || [],
      pricePerHour: row.price_per_hour,
      pricePerHourWeekend: row.price_per_hour_weekend,
      operatingHours: this.parseJsonField(row.operating_hours) || {},
      contactInfo: this.parseJsonField(row.contact_info) || {},
      rating: row.rating,
      totalReviews: row.total_reviews,
      isActive: Boolean(row.is_active),
      createdAt: this.parseDateTime(row.created_at),
      updatedAt: this.parseDateTime(row.updated_at)
    };
  }
}