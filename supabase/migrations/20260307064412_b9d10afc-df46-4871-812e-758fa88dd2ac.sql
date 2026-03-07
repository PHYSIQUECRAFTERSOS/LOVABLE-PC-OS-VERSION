ALTER TABLE profiles ADD COLUMN IF NOT EXISTS weight numeric;

UPDATE profiles p
SET weight = op.weight_lb, weight_unit = 'lbs'
FROM onboarding_profiles op
WHERE op.user_id = p.user_id
  AND op.weight_lb IS NOT NULL
  AND op.weight_lb > 0
  AND (p.weight IS NULL OR p.weight = 0);

UPDATE profiles SET weight_unit = 'lbs' WHERE weight_unit IS NULL OR weight_unit != 'lbs';