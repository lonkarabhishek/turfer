-- ==============================================
-- TURF OWNER DASHBOARD - DATABASE TABLES
-- ==============================================
-- Run these queries in Supabase SQL Editor

-- 1. TURFS TABLE (Enhanced for owner management)
CREATE TABLE IF NOT EXISTS public.turfs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    address TEXT NOT NULL,
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    
    -- Turf Details
    surface_type VARCHAR(50), -- grass, artificial, indoor, etc.
    sport_types TEXT[], -- array: ['football', 'cricket', 'tennis']
    capacity INTEGER,
    facilities TEXT[], -- array: ['parking', 'changing_rooms', 'cafeteria']
    
    -- Pricing & Availability
    price_per_hour DECIMAL(10, 2),
    operating_hours JSONB, -- {"start": "06:00", "end": "23:00"}
    availability JSONB, -- {"monday": true, "tuesday": true, ...}
    
    -- Business Info
    phone VARCHAR(20),
    email VARCHAR(255),
    website VARCHAR(255),
    
    -- Status & Ratings
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    average_rating DECIMAL(3, 2) DEFAULT 0,
    total_ratings INTEGER DEFAULT 0,
    
    -- Images
    images TEXT[], -- array of image URLs
    featured_image TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. TURF BOOKINGS TABLE (Enhanced for owner analytics)
CREATE TABLE IF NOT EXISTS public.turf_bookings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    turf_id UUID REFERENCES public.turfs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Booking Details
    booking_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    duration_hours DECIMAL(4, 2),
    
    -- Pricing
    hourly_rate DECIMAL(10, 2),
    total_amount DECIMAL(10, 2),
    discount_amount DECIMAL(10, 2) DEFAULT 0,
    tax_amount DECIMAL(10, 2) DEFAULT 0,
    final_amount DECIMAL(10, 2),
    
    -- Payment
    payment_status VARCHAR(20) DEFAULT 'pending', -- pending, paid, failed, refunded
    payment_method VARCHAR(50), -- card, upi, cash, wallet
    payment_id VARCHAR(255),
    
    -- Booking Status
    status VARCHAR(20) DEFAULT 'confirmed', -- pending, confirmed, cancelled, completed, no_show
    cancellation_reason TEXT,
    cancelled_by UUID REFERENCES auth.users(id),
    cancelled_at TIMESTAMP WITH TIME ZONE,
    
    -- Contact Info
    customer_name VARCHAR(255),
    customer_phone VARCHAR(20),
    customer_email VARCHAR(255),
    
    -- Special Requests
    notes TEXT,
    special_requests TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. TURF REVIEWS TABLE
CREATE TABLE IF NOT EXISTS public.turf_reviews (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    turf_id UUID REFERENCES public.turfs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES public.turf_bookings(id) ON DELETE SET NULL,
    
    -- Review Details
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(255),
    comment TEXT,
    
    -- Review Categories
    cleanliness_rating INTEGER CHECK (cleanliness_rating >= 1 AND cleanliness_rating <= 5),
    facilities_rating INTEGER CHECK (facilities_rating >= 1 AND facilities_rating <= 5),
    staff_rating INTEGER CHECK (staff_rating >= 1 AND staff_rating <= 5),
    value_rating INTEGER CHECK (value_rating >= 1 AND value_rating <= 5),
    
    -- Status
    is_verified BOOLEAN DEFAULT false,
    is_featured BOOLEAN DEFAULT false,
    
    -- Response from owner
    owner_response TEXT,
    owner_response_date TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. TURF OWNER EARNINGS TABLE
CREATE TABLE IF NOT EXISTS public.turf_owner_earnings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    turf_id UUID REFERENCES public.turfs(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES public.turf_bookings(id) ON DELETE CASCADE,
    
    -- Earnings Breakdown
    gross_amount DECIMAL(10, 2),
    platform_fee DECIMAL(10, 2) DEFAULT 0,
    tax_deducted DECIMAL(10, 2) DEFAULT 0,
    net_amount DECIMAL(10, 2),
    
    -- Payment Info
    payout_status VARCHAR(20) DEFAULT 'pending', -- pending, processing, paid, failed
    payout_date DATE,
    payout_method VARCHAR(50), -- bank_transfer, upi, wallet
    payout_reference VARCHAR(255),
    
    -- Period
    earning_date DATE,
    earning_month INTEGER,
    earning_year INTEGER,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. TURF AVAILABILITY SLOTS TABLE
CREATE TABLE IF NOT EXISTS public.turf_availability (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    turf_id UUID REFERENCES public.turfs(id) ON DELETE CASCADE,
    
    -- Slot Details
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    
    -- Pricing (can override turf default)
    price_override DECIMAL(10, 2),
    
    -- Status
    is_available BOOLEAN DEFAULT true,
    is_blocked BOOLEAN DEFAULT false,
    block_reason VARCHAR(255),
    
    -- Special Pricing
    is_peak_hour BOOLEAN DEFAULT false,
    is_weekend BOOLEAN DEFAULT false,
    special_price_name VARCHAR(100), -- 'Weekend Special', 'Peak Hour'
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. TURF MAINTENANCE LOG TABLE
CREATE TABLE IF NOT EXISTS public.turf_maintenance (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    turf_id UUID REFERENCES public.turfs(id) ON DELETE CASCADE,
    
    -- Maintenance Details
    maintenance_type VARCHAR(100), -- cleaning, repair, upgrade, inspection
    description TEXT,
    cost DECIMAL(10, 2),
    
    -- Scheduling
    scheduled_date DATE,
    completed_date DATE,
    
    -- Status
    status VARCHAR(20) DEFAULT 'scheduled', -- scheduled, in_progress, completed, cancelled
    priority VARCHAR(10) DEFAULT 'medium', -- low, medium, high, urgent
    
    -- Contractor/Staff
    assigned_to VARCHAR(255),
    contractor_name VARCHAR(255),
    contractor_phone VARCHAR(20),
    
    -- Documentation
    before_images TEXT[],
    after_images TEXT[],
    notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==============================================
-- INDEXES FOR PERFORMANCE
-- ==============================================

-- Turfs indexes
CREATE INDEX IF NOT EXISTS idx_turfs_owner_id ON public.turfs(owner_id);
CREATE INDEX IF NOT EXISTS idx_turfs_city ON public.turfs(city);
CREATE INDEX IF NOT EXISTS idx_turfs_sport_types ON public.turfs USING GIN(sport_types);
CREATE INDEX IF NOT EXISTS idx_turfs_active ON public.turfs(is_active);

-- Bookings indexes
CREATE INDEX IF NOT EXISTS idx_bookings_turf_id ON public.turf_bookings(turf_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON public.turf_bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_owner_id ON public.turf_bookings(owner_id);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON public.turf_bookings(booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.turf_bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON public.turf_bookings(payment_status);

-- Reviews indexes
CREATE INDEX IF NOT EXISTS idx_reviews_turf_id ON public.turf_reviews(turf_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON public.turf_reviews(user_id);

-- Earnings indexes
CREATE INDEX IF NOT EXISTS idx_earnings_owner_id ON public.turf_owner_earnings(owner_id);
CREATE INDEX IF NOT EXISTS idx_earnings_date ON public.turf_owner_earnings(earning_date);
CREATE INDEX IF NOT EXISTS idx_earnings_month_year ON public.turf_owner_earnings(earning_month, earning_year);

-- Availability indexes
CREATE INDEX IF NOT EXISTS idx_availability_turf_date ON public.turf_availability(turf_id, date);

-- ==============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================

-- Enable RLS
ALTER TABLE public.turfs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turf_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turf_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turf_owner_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turf_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turf_maintenance ENABLE ROW LEVEL SECURITY;

-- Turfs policies
CREATE POLICY "Owners can manage their turfs" ON public.turfs
    FOR ALL USING (auth.uid() = owner_id);

CREATE POLICY "Public can view active turfs" ON public.turfs
    FOR SELECT USING (is_active = true);

-- Bookings policies
CREATE POLICY "Owners can view their turf bookings" ON public.turf_bookings
    FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can view their own bookings" ON public.turf_bookings
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create bookings" ON public.turf_bookings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can update booking status" ON public.turf_bookings
    FOR UPDATE USING (auth.uid() = owner_id);

-- Reviews policies
CREATE POLICY "Users can create reviews for their bookings" ON public.turf_reviews
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Public can view reviews" ON public.turf_reviews
    FOR SELECT USING (true);

CREATE POLICY "Owners can respond to reviews" ON public.turf_reviews
    FOR UPDATE USING (auth.uid() IN (
        SELECT owner_id FROM public.turfs WHERE id = turf_id
    ));

-- Earnings policies
CREATE POLICY "Owners can view their earnings" ON public.turf_owner_earnings
    FOR SELECT USING (auth.uid() = owner_id);

-- Availability policies
CREATE POLICY "Owners can manage availability" ON public.turf_availability
    FOR ALL USING (auth.uid() IN (
        SELECT owner_id FROM public.turfs WHERE id = turf_id
    ));

CREATE POLICY "Public can view availability" ON public.turf_availability
    FOR SELECT USING (true);

-- Maintenance policies
CREATE POLICY "Owners can manage maintenance" ON public.turf_maintenance
    FOR ALL USING (auth.uid() IN (
        SELECT owner_id FROM public.turfs WHERE id = turf_id
    ));

-- ==============================================
-- SAMPLE DATA FOR TESTING (OPTIONAL)
-- ==============================================

-- Note: Replace 'your-user-id-here' with actual user ID from auth.users
/*
INSERT INTO public.turfs (owner_id, name, description, address, city, surface_type, sport_types, capacity, price_per_hour, phone, is_active) 
VALUES 
    ('your-user-id-here', 'Elite Sports Arena', 'Premium football turf with modern facilities', '123 Sports Complex, MG Road', 'Nashik', 'artificial_grass', ARRAY['football', 'cricket'], 22, 1500.00, '+91-9876543210', true),
    ('your-user-id-here', 'Champions Cricket Ground', 'Professional cricket ground with nets', '456 Stadium Road', 'Nashik', 'natural_grass', ARRAY['cricket'], 50, 2000.00, '+91-9876543211', true);
*/

-- ==============================================
-- FUNCTIONS FOR ANALYTICS (OPTIONAL)
-- ==============================================

-- Function to calculate monthly revenue for owner
CREATE OR REPLACE FUNCTION get_owner_monthly_revenue(owner_uuid UUID, target_year INTEGER)
RETURNS TABLE (
    month INTEGER,
    month_name TEXT,
    total_bookings BIGINT,
    gross_revenue DECIMAL,
    net_revenue DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        EXTRACT(MONTH FROM tb.booking_date)::INTEGER as month,
        TO_CHAR(DATE_TRUNC('month', tb.booking_date), 'Month') as month_name,
        COUNT(tb.id) as total_bookings,
        COALESCE(SUM(tb.final_amount), 0) as gross_revenue,
        COALESCE(SUM(toe.net_amount), 0) as net_revenue
    FROM turf_bookings tb
    LEFT JOIN turf_owner_earnings toe ON tb.id = toe.booking_id
    WHERE tb.owner_id = owner_uuid 
    AND EXTRACT(YEAR FROM tb.booking_date) = target_year
    AND tb.status = 'completed'
    GROUP BY EXTRACT(MONTH FROM tb.booking_date), DATE_TRUNC('month', tb.booking_date)
    ORDER BY month;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;