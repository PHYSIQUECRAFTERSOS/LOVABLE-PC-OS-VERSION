
-- Client goals (cut, maintain, lean gain)
CREATE TABLE public.client_goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  goal TEXT NOT NULL DEFAULT 'cut' CHECK (goal IN ('cut', 'maintain', 'lean_gain')),
  target_rate NUMERIC NOT NULL DEFAULT 0.5, -- lbs/week target loss/gain
  starting_weight NUMERIC,
  target_weight NUMERIC,
  started_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);

ALTER TABLE public.client_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can manage own goals" ON public.client_goals FOR ALL USING (client_id = auth.uid());
CREATE POLICY "Coaches can view client goals" ON public.client_goals FOR SELECT USING (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- TDEE estimates history
CREATE TABLE public.tdee_estimates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  estimated_tdee NUMERIC NOT NULL,
  avg_daily_calories NUMERIC NOT NULL,
  avg_weight NUMERIC NOT NULL,
  weight_change_rate NUMERIC NOT NULL, -- lbs per week
  adherence_pct NUMERIC NOT NULL DEFAULT 0,
  data_points INTEGER NOT NULL DEFAULT 0,
  calculated_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tdee_estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can manage own tdee" ON public.tdee_estimates FOR ALL USING (client_id = auth.uid());
CREATE POLICY "Coaches can view tdee" ON public.tdee_estimates FOR SELECT USING (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Macro adjustment history
CREATE TABLE public.macro_adjustment_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  previous_calories INTEGER NOT NULL,
  new_calories INTEGER NOT NULL,
  previous_protein INTEGER,
  new_protein INTEGER,
  previous_carbs INTEGER,
  new_carbs INTEGER,
  previous_fat INTEGER,
  new_fat INTEGER,
  reason TEXT NOT NULL,
  estimated_tdee NUMERIC,
  adjustment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.macro_adjustment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own adjustments" ON public.macro_adjustment_history FOR ALL USING (client_id = auth.uid());
CREATE POLICY "Coaches can view adjustments" ON public.macro_adjustment_history FOR SELECT USING (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
