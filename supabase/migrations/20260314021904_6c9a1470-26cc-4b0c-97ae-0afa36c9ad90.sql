
-- Challenge-specific tiers (Bronze/Silver/Gold/Platinum/Diamond per challenge)
CREATE TABLE IF NOT EXISTS public.challenge_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid REFERENCES public.challenges(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  min_points integer NOT NULL DEFAULT 0,
  color text NOT NULL DEFAULT '#CD7F32',
  icon text DEFAULT '🥉',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.challenge_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read challenge tiers"
  ON public.challenge_tiers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Coaches and admins can manage challenge tiers"
  ON public.challenge_tiers FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin')
  );

-- Challenge scoring rules
CREATE TABLE IF NOT EXISTS public.challenge_scoring_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid REFERENCES public.challenges(id) ON DELETE CASCADE NOT NULL,
  action_type text NOT NULL,
  points integer NOT NULL DEFAULT 1,
  daily_cap integer NOT NULL DEFAULT 1,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.challenge_scoring_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read scoring rules"
  ON public.challenge_scoring_rules FOR SELECT TO authenticated USING (true);

CREATE POLICY "Coaches and admins can manage scoring rules"
  ON public.challenge_scoring_rules FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin')
  );
