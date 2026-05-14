
-- Per-meal notes
CREATE TABLE IF NOT EXISTS public.meal_plan_meal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_id uuid NOT NULL REFERENCES public.meal_plan_days(id) ON DELETE CASCADE,
  meal_order integer NOT NULL,
  meal_name text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day_id, meal_order)
);

CREATE INDEX IF NOT EXISTS idx_mpmn_day_id ON public.meal_plan_meal_notes(day_id);

ALTER TABLE public.meal_plan_meal_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches manage meal notes"
ON public.meal_plan_meal_notes
FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.meal_plan_days d
  JOIN public.meal_plans mp ON mp.id = d.meal_plan_id
  WHERE d.id = meal_plan_meal_notes.day_id
    AND (mp.coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.meal_plan_days d
  JOIN public.meal_plans mp ON mp.id = d.meal_plan_id
  WHERE d.id = meal_plan_meal_notes.day_id
    AND (mp.coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
));

CREATE POLICY "Clients view assigned meal notes"
ON public.meal_plan_meal_notes
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.meal_plan_days d
  JOIN public.meal_plans mp ON mp.id = d.meal_plan_id
  WHERE d.id = meal_plan_meal_notes.day_id
    AND mp.client_id = auth.uid()
));

CREATE TRIGGER trg_mpmn_updated_at
BEFORE UPDATE ON public.meal_plan_meal_notes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Per-food note
ALTER TABLE public.meal_plan_items
ADD COLUMN IF NOT EXISTS note text;
