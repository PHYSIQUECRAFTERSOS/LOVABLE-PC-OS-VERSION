
CREATE TABLE foods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  off_id TEXT UNIQUE,
  name TEXT NOT NULL,
  brand TEXT,
  calories_per_100g NUMERIC,
  protein_per_100g NUMERIC,
  carbs_per_100g NUMERIC,
  fat_per_100g NUMERIC,
  fiber_per_100g NUMERIC,
  sugar_per_100g NUMERIC,
  sodium_per_100g NUMERIC,
  serving_size_g NUMERIC DEFAULT 100,
  serving_unit TEXT DEFAULT 'g',
  image_url TEXT,
  barcode TEXT,
  is_branded BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT false,
  is_custom BOOLEAN DEFAULT false,
  search_vector tsvector,
  popularity_score INTEGER DEFAULT 0,
  source TEXT DEFAULT 'open_food_facts',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX foods_search_idx ON foods USING GIN(search_vector);
CREATE INDEX foods_name_idx ON foods (name);
CREATE INDEX foods_brand_idx ON foods (brand);
CREATE INDEX foods_barcode_idx ON foods (barcode);
CREATE INDEX foods_popularity_idx ON foods (popularity_score DESC);
CREATE INDEX foods_off_id_idx ON foods (off_id);

CREATE OR REPLACE FUNCTION foods_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.brand, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER foods_search_vector_trigger
  BEFORE INSERT OR UPDATE ON foods
  FOR EACH ROW EXECUTE FUNCTION foods_search_vector_update();

CREATE TABLE food_search_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  results_count INTEGER DEFAULT 0,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE food_selection_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  food_id UUID REFERENCES foods(id),
  user_id UUID REFERENCES auth.users(id),
  meal_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION increment_food_popularity()
RETURNS trigger AS $$
BEGIN
  UPDATE foods SET popularity_score = popularity_score + 1
  WHERE id = NEW.food_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER food_selected_trigger
  AFTER INSERT ON food_selection_log
  FOR EACH ROW EXECUTE FUNCTION increment_food_popularity();

ALTER TABLE foods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Foods readable by authenticated users" ON foods FOR SELECT TO authenticated USING (true);
CREATE POLICY "Custom foods insertable by authenticated users" ON foods FOR INSERT TO authenticated WITH CHECK (is_custom = true);
CREATE POLICY "Users can update their custom foods" ON foods FOR UPDATE TO authenticated USING (is_custom = true);

ALTER TABLE food_search_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users log their own searches" ON food_search_log FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

ALTER TABLE food_selection_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users log their own selections" ON food_selection_log FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
