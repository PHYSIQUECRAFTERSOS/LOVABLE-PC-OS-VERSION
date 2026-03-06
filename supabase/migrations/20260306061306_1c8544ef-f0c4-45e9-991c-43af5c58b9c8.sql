ALTER TABLE nutrition_logs 
ADD COLUMN IF NOT EXISTS quantity_display numeric,
ADD COLUMN IF NOT EXISTS quantity_unit text DEFAULT 'g';