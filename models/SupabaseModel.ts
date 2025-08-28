import { SupabaseClient } from '@supabase/supabase-js';
import SupabaseConnection from '../database/supabase';
import { v4 as uuidv4 } from 'uuid';

export abstract class SupabaseModel {
  protected db: SupabaseClient;
  protected abstract tableName: string;

  constructor() {
    this.db = SupabaseConnection.getInstance().getClient();
  }

  protected generateId(): string {
    return uuidv4();
  }

  protected parseJsonField(field: any): any {
    if (typeof field === 'string') {
      try {
        return JSON.parse(field);
      } catch {
        return field;
      }
    }
    return field;
  }

  protected stringifyJsonField(field: any): string {
    if (typeof field === 'object' && field !== null) {
      return JSON.stringify(field);
    }
    return field;
  }

  protected parseDateTime(dateTime: any): Date {
    return new Date(dateTime);
  }

  // Generic CRUD operations
  async findById(id: string): Promise<any> {
    const { data, error } = await this.db
      .from(this.tableName)
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
      throw error;
    }

    return data;
  }

  async findAll(filters: Record<string, any> = {}, limit?: number): Promise<any[]> {
    let query = this.db.from(this.tableName).select('*');

    // Apply filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        query = query.eq(key, value);
      }
    });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data || [];
  }

  async create(data: any): Promise<any> {
    const { data: result, error } = await this.db
      .from(this.tableName)
      .insert(data)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return result;
  }

  async update(id: string, updates: any): Promise<any> {
    const { data, error } = await this.db
      .from(this.tableName)
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async delete(id: string): Promise<boolean> {
    const { error } = await this.db
      .from(this.tableName)
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    return true;
  }

  async count(filters: Record<string, any> = {}): Promise<number> {
    let query = this.db.from(this.tableName).select('*', { count: 'exact', head: true });

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        query = query.eq(key, value);
      }
    });

    const { count, error } = await query;

    if (error) {
      throw error;
    }

    return count || 0;
  }
}