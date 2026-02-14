
-- Add new columns to supplements table for barcode, form types, bioavailability, coach features
ALTER TABLE public.supplements
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS servings_per_container integer,
  ADD COLUMN IF NOT EXISTS form_type text,
  ADD COLUMN IF NOT EXISTS bioavailability_multiplier numeric DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_coach_recommended boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS coach_id uuid,
  ADD COLUMN IF NOT EXISTS calories numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS protein numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS carbs numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fat numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fiber numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sodium numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cholesterol numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS added_sugars numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS electrolytes_mg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS data_source text DEFAULT 'manual';

-- Add index on barcode for fast lookups
CREATE INDEX IF NOT EXISTS idx_supplements_barcode ON public.supplements(barcode) WHERE barcode IS NOT NULL;

-- Create supplement_nutrient_forms table for per-nutrient form tracking
CREATE TABLE IF NOT EXISTS public.supplement_nutrient_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplement_id uuid NOT NULL REFERENCES public.supplements(id) ON DELETE CASCADE,
  nutrient_key text NOT NULL,
  form_name text NOT NULL,
  absorption_multiplier numeric NOT NULL DEFAULT 1.0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.supplement_nutrient_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view supplement forms"
  ON public.supplement_nutrient_forms FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.supplements s WHERE s.id = supplement_nutrient_forms.supplement_id
    AND (s.client_id = auth.uid() OR s.is_verified = true OR has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  ));

CREATE POLICY "Users can manage own supplement forms"
  ON public.supplement_nutrient_forms FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.supplements s WHERE s.id = supplement_nutrient_forms.supplement_id
    AND (s.client_id = auth.uid() OR has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  ));

-- Update supplement_logs to track form-adjusted amounts
ALTER TABLE public.supplement_logs
  ADD COLUMN IF NOT EXISTS notes text;

-- Coach-pushed supplement stacks
CREATE TABLE IF NOT EXISTS public.supplement_stacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  client_id uuid,
  name text NOT NULL,
  description text,
  supplement_ids uuid[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.supplement_stacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage stacks"
  ON public.supplement_stacks FOR ALL
  USING (coach_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view assigned stacks"
  ON public.supplement_stacks FOR SELECT
  USING (client_id = auth.uid());
