-- challenge_templates table
CREATE TABLE IF NOT EXISTS public.challenge_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  name text NOT NULL,
  description text,
  challenge_type text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_duration_days integer,
  default_xp_reward integer DEFAULT 100,
  default_enrollment text DEFAULT 'opt_in',
  usage_count integer DEFAULT 0,
  is_archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.challenge_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on challenge_templates" ON public.challenge_templates
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Coach CRUD own templates" ON public.challenge_templates
  FOR ALL USING (created_by = auth.uid() AND public.has_role(auth.uid(), 'coach'))
  WITH CHECK (created_by = auth.uid() AND public.has_role(auth.uid(), 'coach'));

-- challenge_banner_dismissals table
CREATE TABLE IF NOT EXISTS public.challenge_banner_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  challenge_id uuid NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  dismissed_at timestamptz DEFAULT now(),
  UNIQUE(user_id, challenge_id)
);

ALTER TABLE public.challenge_banner_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own dismissals" ON public.challenge_banner_dismissals
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());