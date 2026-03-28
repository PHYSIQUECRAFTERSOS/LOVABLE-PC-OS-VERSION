
-- Create client_guide_overrides table for per-client guide customizations
CREATE TABLE IF NOT EXISTS client_guide_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  coach_id UUID NOT NULL,
  section_key TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL DEFAULT '',
  is_hidden BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, section_key)
);

ALTER TABLE client_guide_overrides ENABLE ROW LEVEL SECURITY;

-- Coach can manage overrides for their clients
CREATE POLICY "coach_manage_guide_overrides" ON client_guide_overrides
  FOR ALL TO authenticated
  USING (
    coach_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    coach_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

-- Client can read their own overrides
CREATE POLICY "client_read_own_overrides" ON client_guide_overrides
  FOR SELECT TO authenticated
  USING (client_id = auth.uid());

-- Add category column to nutrition_guide_sections
ALTER TABLE nutrition_guide_sections ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';

-- Set categories for existing section_keys
UPDATE nutrition_guide_sections SET category = 'hydration' WHERE section_key = 'water_recommendation';
UPDATE nutrition_guide_sections SET category = 'daily_habits' WHERE section_key = 'daily_ritual';
UPDATE nutrition_guide_sections SET category = 'tracking' WHERE section_key IN ('nutrition_tips', 'meal_planning');
UPDATE nutrition_guide_sections SET category = 'eating_out' WHERE section_key IN ('eating_out_cheat_sheet', 'eating_out_examples');
UPDATE nutrition_guide_sections SET category = 'reference' WHERE section_key = 'macro_cheat_sheet';
