import { SupabaseModel } from './SupabaseModel';
import { Turf as TurfType } from '../types';

export class TurfModel extends SupabaseModel {
  protected tableName = 'turfs';

  async create(turfData: Omit<TurfType, 'id' | 'createdAt' | 'updatedAt'>): Promise<TurfType> {
    const data = {
      id: this.generateId(),
      owner_id: turfData.ownerId,
      name: turfData.name,
      address: turfData.address,
      lat: turfData.coordinates?.lat,
      lng: turfData.coordinates?.lng,
      description: turfData.description,
      sports: turfData.sports,
      amenities: turfData.amenities,
      images: turfData.images,
      price_per_hour: turfData.pricePerHour,
      price_per_hour_weekend: turfData.pricePerHourWeekend,
      operating_hours: turfData.operatingHours,
      contact_info: turfData.contactInfo,
      rating: turfData.rating,
      total_reviews: turfData.totalReviews,
      is_active: turfData.isActive
    };

    const result = await super.create(data);
    return this.mapRowToTurf(result);
  }

  async findById(id: string): Promise<TurfType | null> {
    const row = await super.findById(id);
    return row ? this.mapRowToTurf(row) : null;
  }

  async findByOwnerId(ownerId: string): Promise<TurfType[]> {
    const rows = await super.findAll({ owner_id: ownerId });
    return rows.map(this.mapRowToTurf);
  }

  async findActive(filters: {
    sport?: string;
    location?: { lat: number; lng: number; radius: number };
    priceRange?: { min: number; max: number };
    limit?: number;
  } = {}): Promise<TurfType[]> {
    let query = this.db
      .from(this.tableName)
      .select('*')
      .eq('is_active', true);

    if (filters.sport) {
      query = query.contains('sports', [filters.sport]);
    }

    if (filters.priceRange) {
      query = query.gte('price_per_hour', filters.priceRange.min);
      query = query.lte('price_per_hour', filters.priceRange.max);
    }

    // Note: Geographic filtering would require PostGIS extension
    // For now, we'll filter client-side if needed

    query = query.order('rating', { ascending: false });

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;

    if (error) throw error;

    return (data || []).map(this.mapRowToTurf);
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
    if (updates.sports) updateData.sports = updates.sports;
    if (updates.amenities) updateData.amenities = updates.amenities;
    if (updates.images) updateData.images = updates.images;
    if (updates.pricePerHour) updateData.price_per_hour = updates.pricePerHour;
    if (updates.pricePerHourWeekend) updateData.price_per_hour_weekend = updates.pricePerHourWeekend;
    if (updates.operatingHours) updateData.operating_hours = updates.operatingHours;
    if (updates.contactInfo) updateData.contact_info = updates.contactInfo;
    if (updates.rating !== undefined) updateData.rating = updates.rating;
    if (updates.totalReviews !== undefined) updateData.total_reviews = updates.totalReviews;
    if (updates.isActive !== undefined) updateData.is_active = updates.isActive;

    const result = await super.update(id, updateData);
    return result ? this.mapRowToTurf(result) : null;
  }

  async search(query: string, filters: any = {}): Promise<TurfType[]> {
    let dbQuery = this.db
      .from(this.tableName)
      .select('*')
      .eq('is_active', true);

    if (query) {
      dbQuery = dbQuery.or(`name.ilike.%${query}%,address.ilike.%${query}%,description.ilike.%${query}%`);
    }

    if (filters.sport) {
      dbQuery = dbQuery.contains('sports', [filters.sport]);
    }

    if (filters.priceMin) {
      dbQuery = dbQuery.gte('price_per_hour', filters.priceMin);
    }

    if (filters.priceMax) {
      dbQuery = dbQuery.lte('price_per_hour', filters.priceMax);
    }

    dbQuery = dbQuery.order('rating', { ascending: false });

    if (filters.limit) {
      dbQuery = dbQuery.limit(filters.limit);
    }

    const { data, error } = await dbQuery;

    if (error) throw error;

    return (data || []).map(this.mapRowToTurf);
  }

  async findNearby(lat: number, lng: number, radius: number = 10): Promise<TurfType[]> {
    // For now, return all active turfs
    // In a real implementation, you'd use PostGIS for geographic queries
    const { data, error } = await this.db
      .from(this.tableName)
      .select('*')
      .eq('is_active', true)
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .order('rating', { ascending: false });

    if (error) throw error;

    // Simple distance filtering (should be done with PostGIS in production)
    return (data || [])
      .map(this.mapRowToTurf)
      .filter(turf => {
        if (!turf.coordinates) return false;
        const distance = this.calculateDistance(
          lat, lng,
          turf.coordinates.lat, turf.coordinates.lng
        );
        return distance <= radius;
      });
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const d = R * c; // Distance in kilometers
    return d;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI/180);
  }

  private mapRowToTurf = (row: any): TurfType => {
    return {
      id: row.id,
      ownerId: row.owner_id,
      name: row.name,
      address: row.address,
      coordinates: row.lat && row.lng ? {
        lat: parseFloat(row.lat),
        lng: parseFloat(row.lng)
      } : undefined,
      description: row.description,
      sports: row.sports || [],
      amenities: row.amenities || [],
      images: row.images || [],
      pricePerHour: parseFloat(row.price_per_hour),
      pricePerHourWeekend: row.price_per_hour_weekend ? parseFloat(row.price_per_hour_weekend) : undefined,
      operatingHours: row.operating_hours || {},
      contactInfo: row.contact_info || {},
      rating: parseFloat(row.rating || '0'),
      totalReviews: parseInt(row.total_reviews || '0'),
      isActive: row.is_active,
      createdAt: this.parseDateTime(row.created_at),
      updatedAt: this.parseDateTime(row.updated_at)
    };
  };
}