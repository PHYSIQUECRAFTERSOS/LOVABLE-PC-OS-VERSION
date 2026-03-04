
-- Coach favorite foods table
CREATE TABLE public.coach_favorite_foods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL,
  food_item_id UUID NOT NULL REFERENCES public.food_items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(coach_id, food_item_id)
);

-- Indexes
CREATE INDEX idx_coach_favorite_foods_coach ON public.coach_favorite_foods(coach_id);
CREATE INDEX idx_coach_favorite_foods_food ON public.coach_favorite_foods(food_item_id);

-- RLS
ALTER TABLE public.coach_favorite_foods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches manage own favorites"
  ON public.coach_favorite_foods
  FOR ALL
  TO authenticated
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

-- Coach recently used foods table (tracks usage for meal plan builder)
CREATE TABLE public.coach_recent_foods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL,
  food_item_id UUID NOT NULL REFERENCES public.food_items(id) ON DELETE CASCADE,
  used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  use_count INT NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX idx_coach_recent_foods_unique ON public.coach_recent_foods(coach_id, food_item_id);
CREATE INDEX idx_coach_recent_foods_coach ON public.coach_recent_foods(coach_id);
CREATE INDEX idx_coach_recent_foods_used ON public.coach_recent_foods(coach_id, used_at DESC);

ALTER TABLE public.coach_recent_foods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches manage own recents"
  ON public.coach_recent_foods
  FOR ALL
  TO authenticated
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());
