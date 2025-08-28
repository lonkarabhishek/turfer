import bcrypt from 'bcryptjs';
import { BaseModel } from './BaseModel';
import { User as UserType } from '../types';

export class UserModel extends BaseModel {
  async create(userData: Omit<UserType, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserType> {
    const id = this.generateId();
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    
    const sql = `
      INSERT INTO users (id, email, password, name, phone, role, is_verified)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.db.run(sql, [
      id,
      userData.email,
      hashedPassword,
      userData.name,
      userData.phone || null,
      userData.role,
      userData.isVerified ? 1 : 0
    ]);

    return this.findById(id) as Promise<UserType>;
  }

  async findById(id: string): Promise<UserType | null> {
    const sql = 'SELECT * FROM users WHERE id = ?';
    const row = await this.db.get(sql, [id]);
    
    return row ? this.mapRowToUser(row) : null;
  }

  async findByEmail(email: string): Promise<UserType | null> {
    const sql = 'SELECT * FROM users WHERE email = ?';
    const row = await this.db.get(sql, [email]);
    
    return row ? this.mapRowToUser(row) : null;
  }

  async findAll(filters: { role?: string; isVerified?: boolean } = {}): Promise<UserType[]> {
    const { where, params } = this.buildWhereClause({
      role: filters.role,
      is_verified: filters.isVerified !== undefined ? (filters.isVerified ? 1 : 0) : undefined
    });
    
    const sql = `SELECT * FROM users ${where} ORDER BY created_at DESC`;
    const rows = await this.db.all(sql, params);
    
    return rows.map(this.mapRowToUser);
  }

  async update(id: string, updates: Partial<Omit<UserType, 'id' | 'createdAt' | 'updatedAt'>>): Promise<UserType | null> {
    const updateData: any = {};
    
    if (updates.email) updateData.email = updates.email;
    if (updates.name) updateData.name = updates.name;
    if (updates.phone !== undefined) updateData.phone = updates.phone;
    if (updates.role) updateData.role = updates.role;
    if (updates.isVerified !== undefined) updateData.is_verified = updates.isVerified ? 1 : 0;
    if (updates.password) {
      updateData.password = await bcrypt.hash(updates.password, 10);
    }

    const { set, params } = this.buildUpdateClause(updateData);
    
    if (!set) return this.findById(id);
    
    const sql = `UPDATE users SET ${set} WHERE id = ?`;
    await this.db.run(sql, [...params, id]);
    
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const sql = 'DELETE FROM users WHERE id = ?';
    const result = await this.db.run(sql, [id]);
    return result.changes > 0;
  }

  async validatePassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  private mapRowToUser(row: any): UserType {
    return {
      id: row.id,
      email: row.email,
      password: row.password,
      name: row.name,
      phone: row.phone,
      role: row.role,
      isVerified: Boolean(row.is_verified),
      createdAt: this.parseDateTime(row.created_at),
      updatedAt: this.parseDateTime(row.updated_at)
    };
  }
}