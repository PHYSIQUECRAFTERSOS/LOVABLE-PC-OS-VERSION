-- Client Recipes (MFP-style, servings-based)
CREATE TABLE IF NOT EXISTS client_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  name TEXT NOT NULL,
  servings NUMERIC DEFAULT 1,
  calories_per_serving NUMERIC DEFAULT 0,
  protein_per_serving NUMERIC DEFAULT 0,
  carbs_per_serving NUMERIC DEFAULT 0,
  fat_per_serving NUMERIC DEFAULT 0,
  total_calories NUMERIC DEFAULT 0,
  total_protein NUMERIC DEFAULT 0,
  total_carbs NUMERIC DEFAULT 0,
  total_fat NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Client recipe ingredients
CREATE TABLE IF NOT EXISTS client_recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES client_recipes(id) ON DELETE CASCADE,
  food_name TEXT NOT NULL,
  brand TEXT,
  quantity NUMERIC DEFAULT 1,
  serving_size TEXT DEFAULT '100g',
  calories NUMERIC DEFAULT 0,
  protein NUMERIC DEFAULT 0,
  carbs NUMERIC DEFAULT 0,
  fat NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Client custom foods
CREATE TABLE IF NOT EXISTS client_custom_foods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  name TEXT NOT NULL,
  brand TEXT,
  serving_size TEXT DEFAULT '1 serving',
  servings_per_container NUMERIC DEFAULT 1,
  calories NUMERIC DEFAULT 0,
  protein NUMERIC DEFAULT 0,
  carbs NUMERIC DEFAULT 0,
  fat NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE client_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_custom_foods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_own_recipes" ON client_recipes
  FOR ALL USING (auth.uid() = client_id)
  WITH CHECK (auth.uid() = client_id);

CREATE POLICY "clients_own_recipe_ingredients" ON client_recipe_ingredients
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM client_recipes
      WHERE id = client_recipe_ingredients.recipe_id
      AND client_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM client_recipes
      WHERE id = client_recipe_ingredients.recipe_id
      AND client_id = auth.uid()
    )
  );

CREATE POLICY "clients_own_custom_foods" ON client_custom_foods
  FOR ALL USING (auth.uid() = client_id)
  WITH CHECK (auth.uid() = client_id);