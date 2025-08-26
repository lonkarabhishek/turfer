import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

class SupabaseConnection {
  private static instance: SupabaseConnection;
  private supabase: SupabaseClient;

  private constructor() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }

    console.log('🔧 Connecting to Supabase...');
    console.log('📊 Supabase URL:', supabaseUrl);
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Connected to Supabase');

    this.initializeDatabase().catch(err => {
      console.error('❌ Supabase initialization failed:', err);
      console.log('⚠️ Database operations may not work until this is resolved');
    });
  }

  public static getInstance(): SupabaseConnection {
    if (!SupabaseConnection.instance) {
      SupabaseConnection.instance = new SupabaseConnection();
    }
    return SupabaseConnection.instance;
  }

  public getClient(): SupabaseClient {
    return this.supabase;
  }

  private async initializeDatabase() {
    try {
      console.log('🔧 Initializing Supabase database schema...');
      
      // Create tables using Supabase RPC or raw SQL
      await this.createTables();
      
      // Load seed data if needed
      await this.loadSeedData();
      
      console.log('✅ Supabase database initialized successfully');
    } catch (error: any) {
      console.error('❌ Error initializing Supabase database:', error.message);
      throw error;
    }
  }

  private async createTables() {
    console.log('🗃️ Creating database tables...');
    
    // For now, we'll assume tables are created via Supabase dashboard
    // In production, you'd use migrations or RPC calls
    console.log('📋 Tables should be created via Supabase dashboard migrations');
  }

  private async loadSeedData() {
    try {
      // Check if we already have users
      const { data: existingUsers } = await this.supabase
        .from('users')
        .select('id')
        .limit(1);

      if (existingUsers && existingUsers.length > 0) {
        console.log('Seed data already exists, skipping...');
        return;
      }

      console.log('🌱 Loading seed data...');

      // Create demo users
      const demoUserPassword = await bcrypt.hash('password123', 10);
      const demoOwnerPassword = await bcrypt.hash('password123', 10);

      const demoUserId = uuidv4();
      const demoOwnerId = uuidv4();

      // Insert demo users
      const { error: userError } = await this.supabase
        .from('users')
        .insert([
          {
            id: demoUserId,
            email: 'user@turfbooking.com',
            password: demoUserPassword,
            name: 'Demo User',
            phone: '9876543210',
            role: 'user',
            is_verified: true
          },
          {
            id: demoOwnerId,
            email: 'owner@turfbooking.com',
            password: demoOwnerPassword,
            name: 'Demo Owner',
            phone: '9876543211',
            role: 'owner',
            is_verified: true
          }
        ]);

      if (userError) {
        console.error('Error creating demo users:', userError);
        return;
      }

      // Create demo turfs
      const demoTurfs = [
        {
          id: uuidv4(),
          owner_id: demoOwnerId,
          name: "Green Valley Sports Complex",
          address: "Nashik Road, Near Railway Station, Nashik",
          sports: JSON.stringify(["Cricket", "Football"]),
          amenities: JSON.stringify(["Parking", "Changing Room", "Floodlights"]),
          images: JSON.stringify([]),
          price_per_hour: 800,
          price_per_hour_weekend: 960,
          operating_hours: JSON.stringify({
            monday: { open: "06:00", close: "23:00", isOpen: true },
            tuesday: { open: "06:00", close: "23:00", isOpen: true },
            wednesday: { open: "06:00", close: "23:00", isOpen: true },
            thursday: { open: "06:00", close: "23:00", isOpen: true },
            friday: { open: "06:00", close: "23:00", isOpen: true },
            saturday: { open: "06:00", close: "23:00", isOpen: true },
            sunday: { open: "06:00", close: "23:00", isOpen: true }
          }),
          contact_info: JSON.stringify({ phone: "9876543210" }),
          rating: 4.5,
          total_reviews: 25,
          is_active: true
        },
        {
          id: uuidv4(),
          owner_id: demoOwnerId,
          name: "Champions Cricket Club",
          address: "Gangapur Road, Nashik",
          sports: JSON.stringify(["Cricket"]),
          amenities: JSON.stringify(["Parking", "Cafeteria", "Rest Room"]),
          images: JSON.stringify([]),
          price_per_hour: 1000,
          price_per_hour_weekend: 1200,
          operating_hours: JSON.stringify({
            monday: { open: "05:00", close: "22:00", isOpen: true },
            tuesday: { open: "05:00", close: "22:00", isOpen: true },
            wednesday: { open: "05:00", close: "22:00", isOpen: true },
            thursday: { open: "05:00", close: "22:00", isOpen: true },
            friday: { open: "05:00", close: "22:00", isOpen: true },
            saturday: { open: "05:00", close: "22:00", isOpen: true },
            sunday: { open: "05:00", close: "22:00", isOpen: true }
          }),
          contact_info: JSON.stringify({ phone: "9876543211" }),
          rating: 4.2,
          total_reviews: 18,
          is_active: true
        }
      ];

      const { error: turfError } = await this.supabase
        .from('turfs')
        .insert(demoTurfs);

      if (turfError) {
        console.error('Error creating demo turfs:', turfError);
        return;
      }

      console.log(`✅ Seed data loaded: 2 users, ${demoTurfs.length} turfs`);
    } catch (error) {
      console.error('Error loading seed data:', error);
    }
  }

  // Helper method for raw SQL queries if needed
  public async query(sql: string, params: any[] = []) {
    try {
      const { data, error } = await this.supabase.rpc('execute_sql', {
        query: sql,
        params: params
      });
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('SQL query error:', error);
      throw error;
    }
  }
}

export default SupabaseConnection;