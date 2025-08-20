import { Database } from 'sqlite3';
import { readFileSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

class DatabaseConnection {
  private static instance: DatabaseConnection;
  private db: Database;

  private constructor() {
    const dbPath = process.env.DATABASE_URL || './database.sqlite';
    this.db = new Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
        throw err;
      }
      console.log('Connected to SQLite database');
    });

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
      // Enable foreign keys
      await this.run('PRAGMA foreign_keys = ON');
      
      // Read and execute schema
      const schemaPath = path.join(__dirname, 'init.sql');
      const schema = readFileSync(schemaPath, 'utf8');
      
      // Split by semicolons and execute each statement
      const statements = schema.split(';').filter(stmt => stmt.trim());
      
      for (const statement of statements) {
        const trimmed = statement.trim();
        if (trimmed) {
          await this.run(trimmed);
        }
      }
      
      console.log('Database schema initialized successfully');
      
      // Load seed data
      await this.loadSeedData();
    } catch (error) {
      console.error('Error initializing database:', error);
      throw error;
    }
  }

  public getDatabase(): Database {
    return this.db;
  }

  public async run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
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

  public async get(sql: string, params: any[] = []): Promise<any> {
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

  public async all(sql: string, params: any[] = []): Promise<any[]> {
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

      await this.run(
        'INSERT INTO users (id, email, password, name, phone, role, is_verified) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [demoUserId, 'user@turfbooking.com', demoUserPassword, 'Demo User', '9876543210', 'user', 1]
      );

      await this.run(
        'INSERT INTO users (id, email, password, name, phone, role, is_verified) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [demoOwnerId, 'owner@turfbooking.com', demoOwnerPassword, 'Demo Owner', '9876543211', 'owner', 1]
      );

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

      console.log(`✅ Seed data loaded successfully: ${seedData.length} turfs, 2 demo users`);
    } catch (error) {
      console.error('Error loading seed data:', error);
      // Don't throw here, just log - the app can continue without seed data
    }
  }

  public async close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          reject(err);
        } else {
          console.log('Database connection closed');
          resolve(undefined);
        }
      });
    });
  }
}

export default DatabaseConnection;