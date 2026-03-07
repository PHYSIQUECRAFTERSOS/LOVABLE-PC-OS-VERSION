
-- Add new quality and language columns to foods table
ALTER TABLE foods ADD COLUMN IF NOT EXISTS country_code TEXT DEFAULT 'US';
ALTER TABLE foods ADD COLUMN IF NOT EXISTS language_code TEXT DEFAULT 'en';
ALTER TABLE foods ADD COLUMN IF NOT EXISTS data_quality_score INTEGER DEFAULT 0;
ALTER TABLE foods ADD COLUMN IF NOT EXISTS has_complete_macros BOOLEAN DEFAULT false;
ALTER TABLE foods ADD COLUMN IF NOT EXISTS usda_fdc_id TEXT UNIQUE;
ALTER TABLE foods ADD COLUMN IF NOT EXISTS usda_data_type TEXT;

-- Index for quality filtering
CREATE INDEX IF NOT EXISTS foods_quality_idx ON foods (has_complete_macros, data_quality_score DESC);
CREATE INDEX IF NOT EXISTS foods_language_idx ON foods (language_code);
CREATE INDEX IF NOT EXISTS foods_usda_idx ON foods (usda_fdc_id);
CREATE INDEX IF NOT EXISTS foods_country_idx ON foods (country_code);

-- Backfill: mark any existing foods with zero macros as incomplete
UPDATE foods
SET has_complete_macros = false
WHERE (protein_per_100g IS NULL OR protein_per_100g = 0)
  AND (carbs_per_100g IS NULL OR carbs_per_100g = 0)
  AND (fat_per_100g IS NULL OR fat_per_100g = 0);

-- Backfill: mark foods with real macros as complete
UPDATE foods
SET has_complete_macros = true
WHERE (protein_per_100g IS NOT NULL AND protein_per_100g >= 0)
  AND (carbs_per_100g IS NOT NULL AND carbs_per_100g >= 0)
  AND (fat_per_100g IS NOT NULL AND fat_per_100g >= 0)
  AND (protein_per_100g + carbs_per_100g + fat_per_100g) > 0;

-- Function to auto-set has_complete_macros on insert/update
CREATE OR REPLACE FUNCTION foods_set_quality() RETURNS trigger AS $$
BEGIN
  IF (
    (NEW.protein_per_100g IS NOT NULL AND NEW.protein_per_100g >= 0) AND
    (NEW.carbs_per_100g IS NOT NULL AND NEW.carbs_per_100g >= 0) AND
    (NEW.fat_per_100g IS NOT NULL AND NEW.fat_per_100g >= 0) AND
    (COALESCE(NEW.protein_per_100g, 0) + COALESCE(NEW.carbs_per_100g, 0) + COALESCE(NEW.fat_per_100g, 0)) > 0
  ) THEN
    NEW.has_complete_macros := true;
    IF NEW.source = 'usda' THEN
      NEW.data_quality_score := 100;
    ELSIF NEW.is_verified = true THEN
      NEW.data_quality_score := 70;
    ELSE
      NEW.data_quality_score := 40;
    END IF;
  ELSE
    NEW.has_complete_macros := false;
    NEW.data_quality_score := 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS foods_quality_trigger ON foods;
CREATE TRIGGER foods_quality_trigger
  BEFORE INSERT OR UPDATE ON foods
  FOR EACH ROW EXECUTE FUNCTION foods_set_quality();
