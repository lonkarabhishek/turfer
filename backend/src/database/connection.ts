import { Database } from 'sqlite3';
import { Pool, Client } from 'pg';
import { readFileSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

interface DatabaseInterface {
  run(sql: string, params?: any[]): Promise<{ lastID?: number; changes?: number }>;
  get(sql: string, params?: any[]): Promise<any>;
  all(sql: string, params?: any[]): Promise<any[]>;
  close(): Promise<void>;
}

class SQLiteDatabase implements DatabaseInterface {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening SQLite database:', err.message);
        throw err;
      }
      console.log('Connected to SQLite database');
    });
  }

  async run(sql: string, params: any[] = []): Promise<{ lastID?: number; changes?: number }> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }

  async get(sql: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  async all(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          reject(err);
        } else {
          console.log('SQLite database connection closed');
          resolve();
        }
      });
    });
  }

  async enableForeignKeys(): Promise<void> {
    await this.run('PRAGMA foreign_keys = ON');
  }
}

class PostgreSQLDatabase implements DatabaseInterface {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    console.log('Connected to PostgreSQL database');
  }

  async run(sql: string, params: any[] = []): Promise<{ lastID?: number; changes?: number }> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params);
      return { changes: result.rowCount || 0 };
    } finally {
      client.release();
    }
  }

  async get(sql: string, params: any[] = []): Promise<any> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async all(sql: string, params: any[] = []): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
    console.log('PostgreSQL database connection closed');
  }
}

class DatabaseConnection {
  private static instance: DatabaseConnection;
  private db: DatabaseInterface;
  private dbType: string;

  private constructor() {
    const dbUrl = process.env.DATABASE_URL || './database.sqlite';
    this.dbType = process.env.DATABASE_TYPE || 'sqlite';
    
    if (this.dbType === 'postgresql' || dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://')) {
      this.db = new PostgreSQLDatabase(dbUrl);
      this.dbType = 'postgresql';
    } else {
      this.db = new SQLiteDatabase(dbUrl);
      this.dbType = 'sqlite';
    }

    this.initializeDatabase();
  }

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  private async initializeDatabase() {
    try {
      console.log(`Initializing database (${this.dbType})...`);
      
      // Enable foreign keys for SQLite
      if (this.dbType === 'sqlite') {
        await (this.db as SQLiteDatabase).enableForeignKeys();
        console.log('Foreign keys enabled for SQLite');
      }
      
      // Get schema based on database type
      const schema = this.getSchema();
      console.log('Schema loaded, executing statements...');
      
      // Split by semicolons and execute each statement
      const statements = schema.split(';').filter(stmt => stmt.trim());
      console.log(`Executing ${statements.length} schema statements...`);
      
      for (let i = 0; i < statements.length; i++) {
        const trimmed = statements[i].trim();
        if (trimmed) {
          try {
            await this.db.run(trimmed);
            console.log(`Statement ${i + 1}/${statements.length} executed successfully`);
          } catch (statementError: any) {
            console.error(`Error executing statement ${i + 1}:`, statementError.message);
            console.error('Statement:', trimmed);
            throw statementError;
          }
        }
      }
      
      console.log(`Database schema initialized successfully (${this.dbType})`);
      
      // Load seed data
      await this.loadSeedData();
    } catch (error) {
      console.error('Error initializing database:', error);
      throw error;
    }
  }

  private getSchema(): string {
    if (this.dbType === 'postgresql') {
      return `
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(36) PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          name VARCHAR(255) NOT NULL,
          phone VARCHAR(20),
          role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'owner', 'admin')),
          is_verified BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS turfs (
          id VARCHAR(36) PRIMARY KEY,
          owner_id VARCHAR(36) NOT NULL,
          name VARCHAR(255) NOT NULL,
          address TEXT NOT NULL,
          lat REAL,
          lng REAL,
          description TEXT,
          sports JSON NOT NULL,
          amenities JSON NOT NULL,
          images JSON,
          price_per_hour REAL NOT NULL,
          price_per_hour_weekend REAL,
          operating_hours TEXT NOT NULL,
          contact_info JSON,
          rating REAL DEFAULT 0,
          total_reviews INTEGER DEFAULT 0,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (owner_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS bookings (
          id VARCHAR(36) PRIMARY KEY,
          user_id VARCHAR(36) NOT NULL,
          turf_id VARCHAR(36) NOT NULL,
          date VARCHAR(10) NOT NULL,
          start_time VARCHAR(8) NOT NULL,
          end_time VARCHAR(8) NOT NULL,
          total_players INTEGER NOT NULL,
          total_amount REAL NOT NULL,
          status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
          notes TEXT,
          payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'refunded')),
          payment_method VARCHAR(20) CHECK (payment_method IN ('cash', 'online', 'wallet')),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id),
          FOREIGN KEY (turf_id) REFERENCES turfs(id)
        );

        CREATE TABLE IF NOT EXISTS games (
          id VARCHAR(36) PRIMARY KEY,
          host_id VARCHAR(36) NOT NULL,
          turf_id VARCHAR(36) NOT NULL,
          date VARCHAR(10) NOT NULL,
          start_time VARCHAR(8) NOT NULL,
          end_time VARCHAR(8) NOT NULL,
          sport VARCHAR(50) NOT NULL,
          format VARCHAR(50) NOT NULL,
          skill_level VARCHAR(20) DEFAULT 'all' CHECK (skill_level IN ('beginner', 'intermediate', 'advanced', 'all')),
          current_players INTEGER DEFAULT 1,
          max_players INTEGER NOT NULL,
          cost_per_person REAL NOT NULL,
          description TEXT,
          notes TEXT,
          is_private BOOLEAN DEFAULT FALSE,
          join_requests JSON DEFAULT '[]',
          confirmed_players JSON DEFAULT '[]',
          status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'full', 'in_progress', 'completed', 'cancelled')),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (host_id) REFERENCES users(id),
          FOREIGN KEY (turf_id) REFERENCES turfs(id)
        );

        CREATE TABLE IF NOT EXISTS reviews (
          id VARCHAR(36) PRIMARY KEY,
          user_id VARCHAR(36) NOT NULL,
          turf_id VARCHAR(36) NOT NULL,
          booking_id VARCHAR(36),
          rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
          comment TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id),
          FOREIGN KEY (turf_id) REFERENCES turfs(id),
          FOREIGN KEY (booking_id) REFERENCES bookings(id)
        )`;
    } else {
      // SQLite schema (original)
      return `
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          name TEXT NOT NULL,
          phone TEXT,
          role TEXT DEFAULT 'user' CHECK (role IN ('user', 'owner', 'admin')),
          is_verified INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS turfs (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          name TEXT NOT NULL,
          address TEXT NOT NULL,
          lat REAL,
          lng REAL,
          description TEXT,
          sports TEXT NOT NULL,
          amenities TEXT NOT NULL,
          images TEXT,
          price_per_hour REAL NOT NULL,
          price_per_hour_weekend REAL,
          operating_hours TEXT NOT NULL,
          contact_info TEXT,
          rating REAL DEFAULT 0,
          total_reviews INTEGER DEFAULT 0,
          is_active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (owner_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS bookings (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          turf_id TEXT NOT NULL,
          date TEXT NOT NULL,
          start_time TEXT NOT NULL,
          end_time TEXT NOT NULL,
          total_players INTEGER NOT NULL,
          total_amount REAL NOT NULL,
          status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
          notes TEXT,
          payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'refunded')),
          payment_method TEXT CHECK (payment_method IN ('cash', 'online', 'wallet')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id),
          FOREIGN KEY (turf_id) REFERENCES turfs(id)
        );

        CREATE TABLE IF NOT EXISTS games (
          id TEXT PRIMARY KEY,
          host_id TEXT NOT NULL,
          turf_id TEXT NOT NULL,
          date TEXT NOT NULL,
          start_time TEXT NOT NULL,
          end_time TEXT NOT NULL,
          sport TEXT NOT NULL,
          format TEXT NOT NULL,
          skill_level TEXT DEFAULT 'all' CHECK (skill_level IN ('beginner', 'intermediate', 'advanced', 'all')),
          current_players INTEGER DEFAULT 1,
          max_players INTEGER NOT NULL,
          cost_per_person REAL NOT NULL,
          description TEXT,
          notes TEXT,
          is_private INTEGER DEFAULT 0,
          join_requests TEXT DEFAULT '[]',
          confirmed_players TEXT DEFAULT '[]',
          status TEXT DEFAULT 'open' CHECK (status IN ('open', 'full', 'in_progress', 'completed', 'cancelled')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (host_id) REFERENCES users(id),
          FOREIGN KEY (turf_id) REFERENCES turfs(id)
        );

        CREATE TABLE IF NOT EXISTS reviews (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          turf_id TEXT NOT NULL,
          booking_id TEXT,
          rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
          comment TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id),
          FOREIGN KEY (turf_id) REFERENCES turfs(id),
          FOREIGN KEY (booking_id) REFERENCES bookings(id)
        )`;
    }
  }

  public getDatabase(): DatabaseInterface {
    return this.db;
  }

  public getDatabaseType(): string {
    return this.dbType;
  }

  public async run(sql: string, params: any[] = []): Promise<{ lastID?: number; changes?: number }> {
    return this.db.run(sql, params);
  }

  public async get(sql: string, params: any[] = []): Promise<any> {
    return this.db.get(sql, params);
  }

  public async all(sql: string, params: any[] = []): Promise<any[]> {
    return this.db.all(sql, params);
  }

  private async loadSeedData() {
    try {
      // Check if we already have data
      const userCount = await this.get('SELECT COUNT(*) as count FROM users');
      if (userCount.count > 0) {
        console.log('Seed data already exists, skipping...');
        return;
      }

      console.log('Loading seed data...');

      // Create demo users
      const demoUserPassword = await bcrypt.hash('password123', 10);
      const demoOwnerPassword = await bcrypt.hash('password123', 10);

      const demoUserId = uuidv4();
      const demoOwnerId = uuidv4();

      // Insert users with appropriate types based on database
      if (this.dbType === 'postgresql') {
        await this.run(
          'INSERT INTO users (id, email, password, name, phone, role, is_verified) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [demoUserId, 'user@turfbooking.com', demoUserPassword, 'Demo User', '9876543210', 'user', true]
        );

        await this.run(
          'INSERT INTO users (id, email, password, name, phone, role, is_verified) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [demoOwnerId, 'owner@turfbooking.com', demoOwnerPassword, 'Demo Owner', '9876543211', 'owner', true]
        );
      } else {
        await this.run(
          'INSERT INTO users (id, email, password, name, phone, role, is_verified) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [demoUserId, 'user@turfbooking.com', demoUserPassword, 'Demo User', '9876543210', 'user', 1]
        );

        await this.run(
          'INSERT INTO users (id, email, password, name, phone, role, is_verified) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [demoOwnerId, 'owner@turfbooking.com', demoOwnerPassword, 'Demo Owner', '9876543211', 'owner', 1]
        );
      }

      // Load turf data from JSON file
      const seedDataPath = path.join(__dirname, '../../../public/nashik_turfs.seed.json');
      const seedData = JSON.parse(readFileSync(seedDataPath, 'utf8'));

      // Insert turfs from seed data
      for (const turfData of seedData) {
        const turfId = uuidv4();
        const sports = JSON.stringify(turfData.sports || []);
        const amenities = JSON.stringify(turfData.amenities || []);
        const images = JSON.stringify(turfData.photos || []);
        const contactInfo = JSON.stringify(turfData.contact || {});
        
        // Extract price from rates string (basic extraction)
        let pricePerHour = 600; // default
        if (turfData.rates && typeof turfData.rates === 'string') {
          const priceMatch = turfData.rates.match(/₹(\d+)/);
          if (priceMatch) {
            pricePerHour = parseInt(priceMatch[1]);
          }
        }

        if (this.dbType === 'postgresql') {
          await this.run(
            `INSERT INTO turfs (
              id, owner_id, name, address, lat, lng, description, sports, amenities, images, 
              price_per_hour, price_per_hour_weekend, operating_hours, contact_info, 
              rating, total_reviews, is_active
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
            [
              turfId,
              demoOwnerId,
              turfData.name,
              turfData.address,
              null, // lat - we don't have coordinates in the seed data
              null, // lng
              turfData.sports ? turfData.sports.join(', ') + ' turf facility' : 'Sports turf facility',
              sports,
              amenities,
              images,
              pricePerHour,
              Math.round(pricePerHour * 1.2), // Weekend price 20% higher
              turfData.operating_hours || 'Daily 6:00 AM - 11:00 PM',
              contactInfo,
              4.0 + Math.random() * 1.0, // Random rating between 4.0 and 5.0
              Math.floor(Math.random() * 50) + 10, // Random review count 10-60
              true
            ]
          );
        } else {
          await this.run(
            `INSERT INTO turfs (
              id, owner_id, name, address, lat, lng, description, sports, amenities, images, 
              price_per_hour, price_per_hour_weekend, operating_hours, contact_info, 
              rating, total_reviews, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              turfId,
              demoOwnerId,
              turfData.name,
              turfData.address,
              null, // lat - we don't have coordinates in the seed data
              null, // lng
              turfData.sports ? turfData.sports.join(', ') + ' turf facility' : 'Sports turf facility',
              sports,
              amenities,
              images,
              pricePerHour,
              Math.round(pricePerHour * 1.2), // Weekend price 20% higher
              turfData.operating_hours || 'Daily 6:00 AM - 11:00 PM',
              contactInfo,
              4.0 + Math.random() * 1.0, // Random rating between 4.0 and 5.0
              Math.floor(Math.random() * 50) + 10, // Random review count 10-60
              1
            ]
          );
        }
      }

      console.log(`✅ Seed data loaded successfully: ${seedData.length} turfs, 2 demo users`);
    } catch (error) {
      console.error('Error loading seed data:', error);
      // Don't throw here, just log - the app can continue without seed data
    }
  }

  public async close() {
    return this.db.close();
  }
}

export default DatabaseConnection;