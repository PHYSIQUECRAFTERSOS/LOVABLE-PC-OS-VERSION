
-- Add new intake questionnaire columns to onboarding_profiles
ALTER TABLE public.onboarding_profiles
ADD COLUMN IF NOT EXISTS training_location text,
ADD COLUMN IF NOT EXISTS home_equipment_list text,
ADD COLUMN IF NOT EXISTS equipment_photo_urls text[],
ADD COLUMN IF NOT EXISTS gym_name_address text,
ADD COLUMN IF NOT EXISTS wake_time text,
ADD COLUMN IF NOT EXISTS workout_time text,
ADD COLUMN IF NOT EXISTS sleep_time text,
ADD COLUMN IF NOT EXISTS occupation text,
ADD COLUMN IF NOT EXISTS foods_love text,
ADD COLUMN IF NOT EXISTS foods_dislike text,
ADD COLUMN IF NOT EXISTS workout_days_current text,
ADD COLUMN IF NOT EXISTS workout_days_realistic text,
ADD COLUMN IF NOT EXISTS workout_days_realistic_other text,
ADD COLUMN IF NOT EXISTS available_days text[],
ADD COLUMN IF NOT EXISTS motivation_text text,
ADD COLUMN IF NOT EXISTS favorite_body_part text,
ADD COLUMN IF NOT EXISTS work_on_most text,
ADD COLUMN IF NOT EXISTS final_notes text,
ADD COLUMN IF NOT EXISTS waiver_signed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS waiver_signed_at timestamptz,
ADD COLUMN IF NOT EXISTS waiver_signature text;

-- Create equipment photos storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('equipment-photos', 'equipment-photos', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: Users can upload their own equipment photos
CREATE POLICY "Users upload own equipment photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'equipment-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- RLS: Users can view their own equipment photos
CREATE POLICY "Users view own equipment photos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'equipment-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- RLS: Coaches can view client equipment photos
CREATE POLICY "Coaches view client equipment photos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'equipment-photos'
  AND EXISTS (
    SELECT 1 FROM public.coach_clients
    WHERE coach_id = auth.uid()
    AND client_id::text = (storage.foldername(name))[1]
    AND status = 'active'
  )
);
