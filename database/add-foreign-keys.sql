-- Add foreign key constraints to games table
-- This will allow Supabase to properly join turfs and users data

-- Add foreign key for turf_id -> turfs.id
DO $$
BEGIN
    -- Check if foreign key doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'games_turf_id_fkey'
        AND table_name = 'games'
    ) THEN
        ALTER TABLE games
        ADD CONSTRAINT games_turf_id_fkey
        FOREIGN KEY (turf_id)
        REFERENCES turfs(id)
        ON DELETE SET NULL;
    END IF;
END $$;

-- Add foreign key for creator_id -> users.id (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'games_creator_id_fkey'
        AND table_name = 'games'
    ) THEN
        ALTER TABLE games
        ADD CONSTRAINT games_creator_id_fkey
        FOREIGN KEY (creator_id)
        REFERENCES users(id)
        ON DELETE CASCADE;
    END IF;
END $$;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_games_turf_id ON games(turf_id);
CREATE INDEX IF NOT EXISTS idx_games_creator_id ON games(creator_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_date ON games(date);
