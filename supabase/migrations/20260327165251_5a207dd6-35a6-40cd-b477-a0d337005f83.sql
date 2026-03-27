
-- Master supplements catalog
CREATE TABLE IF NOT EXISTS public.master_supplements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL,
  name TEXT NOT NULL,
  brand TEXT,
  default_dosage TEXT,
  default_dosage_unit TEXT DEFAULT 'per day',
  serving_unit TEXT DEFAULT 'capsule',
  serving_size NUMERIC,
  link_url TEXT,
  discount_code TEXT,
  discount_label TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.master_supplements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches manage own master supplements" ON public.master_supplements
  FOR ALL USING (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Supplement plans
CREATE TABLE IF NOT EXISTS public.supplement_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_template BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.supplement_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches manage own supplement plans" ON public.supplement_plans
  FOR ALL USING (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Plan items
CREATE TABLE IF NOT EXISTS public.supplement_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.supplement_plans(id) ON DELETE CASCADE,
  master_supplement_id UUID NOT NULL REFERENCES public.master_supplements(id) ON DELETE CASCADE,
  dosage TEXT,
  dosage_unit TEXT,
  timing_slot TEXT NOT NULL DEFAULT 'any_time',
  sort_order INTEGER NOT NULL DEFAULT 0,
  coach_note TEXT,
  link_url_override TEXT,
  discount_code_override TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.supplement_plan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches manage plan items via plan ownership" ON public.supplement_plan_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.supplement_plans sp WHERE sp.id = plan_id AND (sp.coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin')))
  );

-- Client supplement assignments
CREATE TABLE IF NOT EXISTS public.client_supplement_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  plan_id UUID NOT NULL REFERENCES public.supplement_plans(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

ALTER TABLE public.client_supplement_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches manage client supplement assignments" ON public.client_supplement_assignments
  FOR ALL USING (
    assigned_by = auth.uid() 
    OR public.has_role(auth.uid(), 'admin')
    OR client_id = auth.uid()
  );

-- Client supplement overrides
CREATE TABLE IF NOT EXISTS public.client_supplement_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.client_supplement_assignments(id) ON DELETE CASCADE,
  plan_item_id UUID NOT NULL REFERENCES public.supplement_plan_items(id) ON DELETE CASCADE,
  dosage_override TEXT,
  timing_override TEXT,
  coach_note_override TEXT,
  is_removed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.client_supplement_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches manage client supplement overrides" ON public.client_supplement_overrides
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.client_supplement_assignments csa 
      WHERE csa.id = assignment_id 
      AND (csa.assigned_by = auth.uid() OR public.has_role(auth.uid(), 'admin') OR csa.client_id = auth.uid())
    )
  );
