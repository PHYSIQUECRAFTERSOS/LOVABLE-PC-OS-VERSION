
-- Add source and photo_type columns to progress_photos
ALTER TABLE progress_photos ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';
ALTER TABLE progress_photos ADD COLUMN IF NOT EXISTS photo_type text DEFAULT 'other';

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_progress_photos_client_created ON progress_photos(client_id, created_at DESC);

-- Add weight_unit to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS weight_unit text DEFAULT 'lbs';
