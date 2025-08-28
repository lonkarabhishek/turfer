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
    console.log(`🔧 Opening SQLite database at: ${dbPath}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV}`);
    
    this.db = new Database(dbPath, (err) => {
      if (err) {
        console.error('❌ Error opening database:', err.message);
        console.error('Database path attempted:', dbPath);
        throw err;
      }
      console.log('✅ Connected to SQLite database');
    });

    this.initializeDatabase().catch(err => {
      console.error('❌ Database initialization failed:', err);
      console.log('⚠️ Database operations will not work until this is resolved');
      // Don't throw here to allow server to start
    });
  }

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  private async initializeDatabase() {
    try {
      console.log('🔧 Initializing database schema...');
      
      // Enable foreign keys
      console.log('⚙️ Enabling foreign keys...');
      await this.run('PRAGMA foreign_keys = ON');
      
      // Embedded SQL schema instead of reading from file
      console.log('🗃️ Creating database tables...');
      const schema = `
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
        );
      `;
      
      // Split by semicolons and execute each statement
      const statements = schema.split(';').filter(stmt => stmt.trim());
      console.log(`📊 Executing ${statements.length} schema statements...`);
      
      for (let i = 0; i < statements.length; i++) {
        const trimmed = statements[i].trim();
        if (trimmed) {
          try {
            await this.run(trimmed);
            console.log(`✅ Statement ${i + 1}/${statements.length} executed successfully`);
          } catch (statementError: any) {
            console.error(`❌ Error executing statement ${i + 1}:`, statementError.message);
            console.error('Statement was:', trimmed.substring(0, 100) + '...');
            throw statementError;
          }
        }
      }
      
      console.log('✅ Database schema initialized successfully');
      
      // Load seed data
      await this.loadSeedData();
    } catch (error: any) {
      console.error('❌ Error initializing database:', error.message);
      console.error('Full error:', error);
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

      // Try to load turf data from JSON file, fallback to hardcoded data
      let seedData = [];
      try {
        const seedDataPath = path.join(__dirname, 'nashik_turfs.seed.json');
        seedData = JSON.parse(readFileSync(seedDataPath, 'utf8'));
        console.log('Loaded seed data from file:', seedDataPath);
      } catch (fileError) {
        console.log('Seed file not found, using hardcoded turfs...');
        // Fallback hardcoded data
        seedData = [
          {
            name: "Green Valley Sports Complex",
            address: "Nashik Road, Near Railway Station, Nashik",
            sports: ["Cricket", "Football"],
            amenities: ["Parking", "Changing Room", "Floodlights"],
            rates: "₹800",
            operating_hours: "6:00 AM - 11:00 PM"
          },
          {
            name: "Champions Cricket Club",
            address: "Gangapur Road, Nashik",
            sports: ["Cricket"],
            amenities: ["Parking", "Cafeteria", "Rest Room"],
            rates: "₹1000",
            operating_hours: "5:00 AM - 10:00 PM"
          },
          {
            name: "Sports Zone Nashik",
            address: "College Road, Nashik",
            sports: ["Football", "Cricket", "Badminton"],
            amenities: ["Parking", "Changing Room", "Equipment Rental"],
            rates: "₹600",
            operating_hours: "6:00 AM - 10:00 PM"
          }
        ];
      }

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