-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    "passwordHash" TEXT NOT NULL,
    phone TEXT,
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'owner', 'admin')),
    "isVerified" BOOLEAN DEFAULT FALSE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create turfs table
CREATE TABLE IF NOT EXISTS turfs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "ownerId" UUID REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    coordinates JSONB,
    description TEXT,
    sports TEXT[] DEFAULT '{}',
    amenities TEXT[] DEFAULT '{}',
    images TEXT[] DEFAULT '{}',
    "pricePerHour" DECIMAL(10,2) NOT NULL,
    "pricePerHourWeekend" DECIMAL(10,2),
    "operatingHours" JSONB DEFAULT '{}',
    "contactInfo" JSONB DEFAULT '{}',
    rating DECIMAL(3,2) DEFAULT 0.0,
    "totalReviews" INTEGER DEFAULT 0,
    "isActive" BOOLEAN DEFAULT TRUE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create games table
CREATE TABLE IF NOT EXISTS games (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "creatorId" UUID REFERENCES users(id) ON DELETE CASCADE,
    "turfId" UUID REFERENCES turfs(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    sport TEXT NOT NULL,
    "skillLevel" TEXT DEFAULT 'beginner',
    "maxPlayers" INTEGER NOT NULL,
    "currentPlayers" INTEGER DEFAULT 1,
    date DATE NOT NULL,
    "startTime" TIME NOT NULL,
    "endTime" TIME NOT NULL,
    "pricePerPlayer" DECIMAL(10,2) NOT NULL,
    "gameType" TEXT DEFAULT 'casual',
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'full', 'completed', 'cancelled')),
    "isActive" BOOLEAN DEFAULT TRUE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create game_participants table
CREATE TABLE IF NOT EXISTS game_participants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "gameId" UUID REFERENCES games(id) ON DELETE CASCADE,
    "userId" UUID REFERENCES users(id) ON DELETE CASCADE,
    "joinedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE("gameId", "userId")
);

-- Create bookings table
CREATE TABLE IF NOT EXISTS bookings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "userId" UUID REFERENCES users(id) ON DELETE CASCADE,
    "turfId" UUID REFERENCES turfs(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    "startTime" TIME NOT NULL,
    "endTime" TIME NOT NULL,
    "totalPlayers" INTEGER NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    notes TEXT,
    status TEXT DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
    "paymentStatus" TEXT DEFAULT 'pending' CHECK ("paymentStatus" IN ('pending', 'paid', 'failed', 'refunded')),
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_turfs_active ON turfs("isActive");
CREATE INDEX IF NOT EXISTS idx_turfs_location ON turfs USING GIN (coordinates);
CREATE INDEX IF NOT EXISTS idx_turfs_sports ON turfs USING GIN (sports);
CREATE INDEX IF NOT EXISTS idx_games_active ON games("isActive");
CREATE INDEX IF NOT EXISTS idx_games_date ON games(date);
CREATE INDEX IF NOT EXISTS idx_games_turf ON games("turfId");
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings("userId");
CREATE INDEX IF NOT EXISTS idx_bookings_turf ON bookings("turfId");
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date);

-- Enable Row Level Security (RLS) - optional but recommended
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE turfs ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Insert some sample data for Nashik turfs
INSERT INTO users (name, email, "passwordHash", role) VALUES 
('Admin User', 'admin@tapturf.in', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewfCaGWzE6NjZe5e', 'admin'),
('Turf Owner', 'owner@example.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewfCaGWzE6NjZe5e', 'owner')
ON CONFLICT (email) DO NOTHING;

-- Get the owner user ID for the turfs
DO $$
DECLARE
    owner_id UUID;
BEGIN
    SELECT id INTO owner_id FROM users WHERE email = 'owner@example.com';
    
    -- Insert sample turfs for Nashik
    INSERT INTO turfs (
        "ownerId", name, address, coordinates, description, sports, amenities, 
        "pricePerHour", "pricePerHourWeekend", rating, "totalReviews"
    ) VALUES 
    (owner_id, 'Elite Sports Arena', 'Gangapur Road, Nashik', '{"lat": 19.9975, "lng": 73.7898}', 
     'Premium football and cricket facility with modern amenities', 
     '["Football", "Cricket"]', '["Parking", "Changing Rooms", "Flood Lights", "Canteen"]',
     800, 1000, 4.5, 127),
    (owner_id, 'Victory Ground', 'College Road, Nashik', '{"lat": 20.0059, "lng": 73.7741}',
     'Multi-sport ground perfect for football and cricket matches',
     '["Football", "Cricket", "Volleyball"]', '["Parking", "Rest Area", "Water Facility"]',
     600, 750, 4.2, 89),
    (owner_id, 'Champions Field', 'Mumbai Naka, Nashik', '{"lat": 19.9919, "lng": 73.7749}',
     'Professional grade turf with excellent drainage system',
     '["Football", "Cricket"]', '["Parking", "Changing Rooms", "Flood Lights", "Scoreboard"]',
     900, 1100, 4.7, 203),
    (owner_id, 'Green Valley Sports', 'Satpur Colony, Nashik', '{"lat": 20.0209, "lng": 73.7749}',
     'Natural grass field with beautiful surroundings',
     '["Football", "Cricket", "Rugby"]', '["Parking", "Canteen", "First Aid"]',
     500, 600, 4.0, 67),
    (owner_id, 'Stadium 19', 'Panchavati, Nashik', '{"lat": 20.0176, "lng": 73.7810}',
     'Modern sports complex with multiple game options',
     '["Football", "Basketball", "Badminton"]', '["Parking", "AC Changing Rooms", "Gym", "Cafe"]',
     1200, 1500, 4.8, 156)
    ON CONFLICT DO NOTHING;
END $$;