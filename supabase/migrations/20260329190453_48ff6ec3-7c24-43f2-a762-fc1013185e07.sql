-- Add default_weeks to client_tiers
ALTER TABLE public.client_tiers ADD COLUMN IF NOT EXISTS default_weeks integer;

-- Create client_program_tracker table
CREATE TABLE IF NOT EXISTS public.client_program_tracker (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  client_id uuid NOT NULL,
  client_name text NOT NULL,
  weeks integer NOT NULL DEFAULT 4,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date GENERATED ALWAYS AS (start_date + (weeks * 7)) STORED,
  revenue text,
  notes text,
  tier_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(coach_id, client_id)
);

-- Enable RLS
ALTER TABLE public.client_program_tracker ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Coaches see own tracker rows"
  ON public.client_program_tracker FOR SELECT
  TO authenticated
  USING (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Coaches insert own tracker rows"
  ON public.client_program_tracker FOR INSERT
  TO authenticated
  WITH CHECK (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Coaches update own tracker rows"
  ON public.client_program_tracker FOR UPDATE
  TO authenticated
  USING (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Coaches delete own tracker rows"
  ON public.client_program_tracker FOR DELETE
  TO authenticated
  USING (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Updated_at trigger
CREATE TRIGGER update_client_program_tracker_updated_at
  BEFORE UPDATE ON public.client_program_tracker
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();