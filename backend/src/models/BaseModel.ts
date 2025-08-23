import DatabaseConnection from '../database/connection';
import { v4 as uuidv4 } from 'uuid';

export abstract class BaseModel {
  protected db = DatabaseConnection.getInstance();
  private dbConnection = DatabaseConnection.getInstance();

  protected generateId(): string {
    return uuidv4();
  }

  protected parseJsonField(value: string | null): any {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  protected stringifyJsonField(value: any): string {
    return JSON.stringify(value || []);
  }

  protected formatDateTime(date: Date): string {
    return date.toISOString();
  }

  protected parseDateTime(dateString: string): Date {
    return new Date(dateString);
  }

  protected convertQueryParams(sql: string, params: any[] = []): { sql: string; params: any[] } {
    if (this.dbConnection.getDatabaseType() === 'postgresql') {
      // Convert ? placeholders to $1, $2, $3 for PostgreSQL
      let paramIndex = 1;
      const convertedSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
      
      // Also convert BOOLEAN values for PostgreSQL
      return { 
        sql: convertedSql.replace(/= 0/g, '= FALSE').replace(/= 1/g, '= TRUE'), 
        params 
      };
    }
    return { sql, params };
  }

  protected buildWhereClause(conditions: Record<string, any>): { where: string; params: any[] } {
    const clauses: string[] = [];
    const params: any[] = [];

    Object.entries(conditions).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        clauses.push(`${key} = ?`);
        params.push(value);
      }
    });

    return {
      where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
      params
    };
  }

  protected buildUpdateClause(data: Record<string, any>): { set: string; params: any[] } {
    const clauses: string[] = [];
    const params: any[] = [];

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        clauses.push(`${key} = ?`);
        params.push(value);
      }
    });

    return {
      set: clauses.join(', '),
      params
    };
  }
}