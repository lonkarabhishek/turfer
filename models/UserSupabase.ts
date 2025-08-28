import { SupabaseModel } from './SupabaseModel';
import { User as UserType } from '../types';
import bcrypt from 'bcryptjs';

export class UserModel extends SupabaseModel {
  protected tableName = 'users';

  async create(userData: Omit<UserType, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserType> {
    // Hash password before storing
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    
    const data = {
      id: this.generateId(),
      email: userData.email,
      password: hashedPassword,
      name: userData.name,
      phone: userData.phone,
      role: userData.role,
      is_verified: userData.isVerified
    };

    const result = await super.create(data);
    return this.mapRowToUser(result);
  }

  async findById(id: string): Promise<UserType | null> {
    const row = await super.findById(id);
    return row ? this.mapRowToUser(row) : null;
  }

  async findByEmail(email: string): Promise<UserType | null> {
    const { data, error } = await this.db
      .from(this.tableName)
      .select('*')
      .eq('email', email)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return data ? this.mapRowToUser(data) : null;
  }

  async update(id: string, updates: Partial<Omit<UserType, 'id' | 'createdAt' | 'updatedAt'>>): Promise<UserType | null> {
    const updateData: any = {};
    
    if (updates.email) updateData.email = updates.email;
    if (updates.password) updateData.password = updates.password;
    if (updates.name) updateData.name = updates.name;
    if (updates.phone !== undefined) updateData.phone = updates.phone;
    if (updates.role) updateData.role = updates.role;
    if (updates.isVerified !== undefined) updateData.is_verified = updates.isVerified;

    const result = await super.update(id, updateData);
    return result ? this.mapRowToUser(result) : null;
  }

  async validatePassword(user: UserType, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.password);
  }

  private mapRowToUser = (row: any): UserType => {
    return {
      id: row.id,
      email: row.email,
      password: row.password,
      name: row.name,
      phone: row.phone,
      role: row.role,
      isVerified: row.is_verified,
      createdAt: this.parseDateTime(row.created_at),
      updatedAt: this.parseDateTime(row.updated_at)
    };
  };
}