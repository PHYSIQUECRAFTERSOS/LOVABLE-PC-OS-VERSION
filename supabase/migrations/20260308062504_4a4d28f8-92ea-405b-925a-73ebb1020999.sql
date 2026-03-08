
CREATE TABLE IF NOT EXISTS public.user_food_serving_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  food_id UUID NOT NULL REFERENCES public.food_items(id) ON DELETE CASCADE,
  serving_size NUMERIC NOT NULL,
  serving_unit TEXT NOT NULL,
  last_logged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  log_count INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, food_id)
);

CREATE INDEX IF NOT EXISTS idx_serving_memory_user_food
  ON public.user_food_serving_memory(user_id, food_id);

ALTER TABLE public.user_food_serving_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "serving_memory_own"
  ON public.user_food_serving_memory
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
