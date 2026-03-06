
CREATE TABLE IF NOT EXISTS meal_log_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meal_name text NOT NULL,
  foods jsonb NOT NULL,
  food_count int NOT NULL DEFAULT 0,
  combo_key text NOT NULL,
  total_cal int,
  total_protein numeric,
  total_carbs numeric,
  total_fat numeric,
  logged_date date NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meal_snapshots_user_meal
  ON meal_log_snapshots(user_id, meal_name, logged_date DESC);
CREATE INDEX IF NOT EXISTS idx_meal_snapshots_combo
  ON meal_log_snapshots(user_id, meal_name, combo_key);

ALTER TABLE meal_log_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own meal snapshots"
  ON meal_log_snapshots FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS frequent_meal_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meal_name text NOT NULL,
  template_name text NOT NULL,
  foods jsonb NOT NULL,
  food_count int NOT NULL,
  combo_key text NOT NULL,
  occurrence_count int NOT NULL DEFAULT 1,
  total_cal int,
  total_protein numeric,
  total_carbs numeric,
  total_fat numeric,
  last_logged_at timestamptz DEFAULT now(),
  is_pinned boolean DEFAULT false,
  is_dismissed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, meal_name, combo_key)
);

CREATE INDEX IF NOT EXISTS idx_frequent_meals_user_meal
  ON frequent_meal_templates(user_id, meal_name, occurrence_count DESC);

ALTER TABLE frequent_meal_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own frequent meals"
  ON frequent_meal_templates FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
