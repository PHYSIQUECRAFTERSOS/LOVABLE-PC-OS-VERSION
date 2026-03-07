
ALTER TABLE foods ADD COLUMN IF NOT EXISTS serving_description TEXT;
ALTER TABLE foods ADD COLUMN IF NOT EXISTS household_serving_fulltext TEXT;
ALTER TABLE foods ADD COLUMN IF NOT EXISTS additional_serving_sizes JSONB DEFAULT '[]';

UPDATE foods 
SET serving_description = CONCAT(serving_size_g::TEXT, serving_unit)
WHERE serving_description IS NULL;
