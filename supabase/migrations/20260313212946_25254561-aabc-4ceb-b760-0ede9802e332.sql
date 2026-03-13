
-- Micronutrient display config (global tier/target/sort data)
CREATE TABLE IF NOT EXISTS public.micronutrient_display_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nutrient_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('vitamins', 'minerals', 'fatty_acids_other')),
  tier INTEGER NOT NULL DEFAULT 3 CHECK (tier IN (1, 2, 3)),
  default_target_male NUMERIC,
  default_target_female NUMERIC,
  unit TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  description TEXT,
  why_it_matters TEXT,
  top_food_sources JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Client-level coach overrides
CREATE TABLE IF NOT EXISTS public.client_micronutrient_overrides (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  nutrient_key TEXT NOT NULL,
  custom_target NUMERIC,
  custom_tier INTEGER CHECK (custom_tier IN (1, 2, 3)),
  is_hidden BOOLEAN DEFAULT false,
  coach_notes TEXT,
  updated_by UUID,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, nutrient_key)
);

-- RLS for micronutrient_display_config (read-only for all authenticated)
ALTER TABLE public.micronutrient_display_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read display config"
  ON public.micronutrient_display_config FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can manage display config"
  ON public.micronutrient_display_config FOR ALL
  TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS for client_micronutrient_overrides
ALTER TABLE public.client_micronutrient_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can read own overrides"
  ON public.client_micronutrient_overrides FOR SELECT
  TO authenticated USING (client_id = auth.uid());

CREATE POLICY "Coaches can read overrides for assigned clients"
  ON public.client_micronutrient_overrides FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.coach_clients cc
      WHERE cc.coach_id = auth.uid() AND cc.client_id = client_micronutrient_overrides.client_id AND cc.status = 'active'
    )
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Coaches can insert overrides for assigned clients"
  ON public.client_micronutrient_overrides FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.coach_clients cc
      WHERE cc.coach_id = auth.uid() AND cc.client_id = client_micronutrient_overrides.client_id AND cc.status = 'active'
    )
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Coaches can update overrides for assigned clients"
  ON public.client_micronutrient_overrides FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.coach_clients cc
      WHERE cc.coach_id = auth.uid() AND cc.client_id = client_micronutrient_overrides.client_id AND cc.status = 'active'
    )
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Coaches can delete overrides for assigned clients"
  ON public.client_micronutrient_overrides FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.coach_clients cc
      WHERE cc.coach_id = auth.uid() AND cc.client_id = client_micronutrient_overrides.client_id AND cc.status = 'active'
    )
    OR public.has_role(auth.uid(), 'admin')
  );
