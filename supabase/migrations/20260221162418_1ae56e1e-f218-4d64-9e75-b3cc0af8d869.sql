
-- Add new fields to onboarding_profiles
ALTER TABLE public.onboarding_profiles
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS height_feet integer,
  ADD COLUMN IF NOT EXISTS height_inches integer,
  ADD COLUMN IF NOT EXISTS weight_lb numeric,
  ADD COLUMN IF NOT EXISTS custom_allergy_text text DEFAULT '',
  ADD COLUMN IF NOT EXISTS custom_digestive_text text DEFAULT '',
  ADD COLUMN IF NOT EXISTS bodyfat_range_low numeric,
  ADD COLUMN IF NOT EXISTS bodyfat_range_high numeric,
  ADD COLUMN IF NOT EXISTS bodyfat_final_confirmed numeric,
  ADD COLUMN IF NOT EXISTS confidence_level text,
  ADD COLUMN IF NOT EXISTS baseline_assessment_date timestamptz,
  ADD COLUMN IF NOT EXISTS baseline_photo_set_id text,
  ADD COLUMN IF NOT EXISTS upper_body_score numeric,
  ADD COLUMN IF NOT EXISTS midsection_score numeric,
  ADD COLUMN IF NOT EXISTS lower_body_score numeric,
  ADD COLUMN IF NOT EXISTS posture_flag text;
