
-- ============================================================
-- EXTEND food_items WITH FULL NUTRIENT PROFILE
-- ============================================================

-- Detailed macros
ALTER TABLE public.food_items
  ADD COLUMN IF NOT EXISTS net_carbs numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS soluble_fiber numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insoluble_fiber numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saturated_fat numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monounsaturated_fat numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS polyunsaturated_fat numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trans_fat numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS omega_3 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS omega_6 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cholesterol numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS added_sugars numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS alcohol numeric DEFAULT 0,

  -- Vitamins (mcg unless noted)
  ADD COLUMN IF NOT EXISTS vitamin_a_mcg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vitamin_c_mg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vitamin_d_mcg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vitamin_e_mg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vitamin_k_mcg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vitamin_b1_mg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vitamin_b2_mg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vitamin_b3_mg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vitamin_b5_mg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vitamin_b6_mg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vitamin_b7_mcg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vitamin_b9_mcg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vitamin_b12_mcg numeric DEFAULT 0,

  -- Minerals (mg unless noted)
  ADD COLUMN IF NOT EXISTS calcium_mg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iron_mg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS magnesium_mg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS phosphorus_mg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS potassium_mg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS zinc_mg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS copper_mg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manganese_mg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS selenium_mcg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chromium_mcg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS molybdenum_mcg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iodine_mcg numeric DEFAULT 0,

  -- Food metadata
  ADD COLUMN IF NOT EXISTS food_quality_score integer,
  ADD COLUMN IF NOT EXISTS usda_fdc_id text,
  ADD COLUMN IF NOT EXISTS data_source text DEFAULT 'manual';

-- ============================================================
-- EXTEND nutrition_logs WITH FULL NUTRIENT PROFILE
-- ============================================================
ALTER TABLE public.nutrition_logs
  ADD COLUMN IF NOT EXISTS net_carbs numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS soluble_fiber numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insoluble_fiber numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saturated_fat numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monounsaturated_fat numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS polyunsaturated_fat numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trans_fat numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS omega_3 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS omega_6 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cholesterol numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS added_sugars numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS alcohol numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vitamin_a_mcg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vitamin_c_mg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vitamin_d_mcg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vitamin_e_mg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vitamin_k_mcg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vitamin_b1_mg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vitamin_b2_mg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vitamin_b3_mg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vitamin_b5_mg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vitamin_b6_mg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vitamin_b7_mcg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vitamin_b9_mcg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vitamin_b12_mcg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calcium_mg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iron_mg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS magnesium_mg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS phosphorus_mg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS potassium_mg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS zinc_mg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS copper_mg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manganese_mg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS selenium_mcg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chromium_mcg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS molybdenum_mcg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iodine_mcg numeric DEFAULT 0;

-- ============================================================
-- SUPPLEMENTS TABLE
-- ============================================================
CREATE TABLE public.supplements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  name TEXT NOT NULL,
  brand TEXT,
  serving_size numeric DEFAULT 1,
  serving_unit TEXT DEFAULT 'capsule',
  -- Micronutrient contributions
  vitamin_a_mcg numeric DEFAULT 0,
  vitamin_c_mg numeric DEFAULT 0,
  vitamin_d_mcg numeric DEFAULT 0,
  vitamin_e_mg numeric DEFAULT 0,
  vitamin_k_mcg numeric DEFAULT 0,
  vitamin_b1_mg numeric DEFAULT 0,
  vitamin_b2_mg numeric DEFAULT 0,
  vitamin_b3_mg numeric DEFAULT 0,
  vitamin_b5_mg numeric DEFAULT 0,
  vitamin_b6_mg numeric DEFAULT 0,
  vitamin_b7_mcg numeric DEFAULT 0,
  vitamin_b9_mcg numeric DEFAULT 0,
  vitamin_b12_mcg numeric DEFAULT 0,
  calcium_mg numeric DEFAULT 0,
  iron_mg numeric DEFAULT 0,
  magnesium_mg numeric DEFAULT 0,
  phosphorus_mg numeric DEFAULT 0,
  potassium_mg numeric DEFAULT 0,
  zinc_mg numeric DEFAULT 0,
  copper_mg numeric DEFAULT 0,
  manganese_mg numeric DEFAULT 0,
  selenium_mcg numeric DEFAULT 0,
  chromium_mcg numeric DEFAULT 0,
  molybdenum_mcg numeric DEFAULT 0,
  iodine_mcg numeric DEFAULT 0,
  omega_3 numeric DEFAULT 0,
  omega_6 numeric DEFAULT 0,
  -- Meta
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.supplements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can manage own supplements"
ON public.supplements FOR ALL
USING (client_id = auth.uid())
WITH CHECK (client_id = auth.uid());

CREATE POLICY "Coaches can view supplements"
ON public.supplements FOR SELECT
USING (has_role(auth.uid(), 'coach') OR has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_supplements_updated_at
BEFORE UPDATE ON public.supplements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- SUPPLEMENT LOGS
-- ============================================================
CREATE TABLE public.supplement_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  supplement_id UUID NOT NULL REFERENCES public.supplements(id) ON DELETE CASCADE,
  servings numeric NOT NULL DEFAULT 1,
  logged_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.supplement_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can manage own supplement logs"
ON public.supplement_logs FOR ALL
USING (client_id = auth.uid())
WITH CHECK (client_id = auth.uid());

CREATE POLICY "Coaches can view supplement logs"
ON public.supplement_logs FOR SELECT
USING (has_role(auth.uid(), 'coach') OR has_role(auth.uid(), 'admin'));

-- ============================================================
-- MICRONUTRIENT TARGETS (coach-customizable)
-- ============================================================
CREATE TABLE public.micronutrient_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  coach_id UUID,
  -- Vitamins
  vitamin_a_mcg numeric DEFAULT 900,
  vitamin_c_mg numeric DEFAULT 90,
  vitamin_d_mcg numeric DEFAULT 15,
  vitamin_e_mg numeric DEFAULT 15,
  vitamin_k_mcg numeric DEFAULT 120,
  vitamin_b1_mg numeric DEFAULT 1.2,
  vitamin_b2_mg numeric DEFAULT 1.3,
  vitamin_b3_mg numeric DEFAULT 16,
  vitamin_b5_mg numeric DEFAULT 5,
  vitamin_b6_mg numeric DEFAULT 1.3,
  vitamin_b7_mcg numeric DEFAULT 30,
  vitamin_b9_mcg numeric DEFAULT 400,
  vitamin_b12_mcg numeric DEFAULT 2.4,
  -- Minerals
  calcium_mg numeric DEFAULT 1000,
  iron_mg numeric DEFAULT 18,
  magnesium_mg numeric DEFAULT 400,
  phosphorus_mg numeric DEFAULT 700,
  potassium_mg numeric DEFAULT 2600,
  zinc_mg numeric DEFAULT 11,
  copper_mg numeric DEFAULT 0.9,
  manganese_mg numeric DEFAULT 2.3,
  selenium_mcg numeric DEFAULT 55,
  chromium_mcg numeric DEFAULT 35,
  molybdenum_mcg numeric DEFAULT 45,
  iodine_mcg numeric DEFAULT 150,
  omega_3 numeric DEFAULT 1.6,
  sodium_mg numeric DEFAULT 2300,
  -- Meta
  is_athlete_profile BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.micronutrient_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own micro targets"
ON public.micronutrient_targets FOR SELECT
USING (client_id = auth.uid());

CREATE POLICY "Coaches can manage micro targets"
ON public.micronutrient_targets FOR ALL
USING (
  (coach_id = auth.uid()) OR has_role(auth.uid(), 'admin')
)
WITH CHECK (
  (coach_id = auth.uid()) OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Clients can insert own micro targets"
ON public.micronutrient_targets FOR INSERT
WITH CHECK (client_id = auth.uid());

CREATE TRIGGER update_micronutrient_targets_updated_at
BEFORE UPDATE ON public.micronutrient_targets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
