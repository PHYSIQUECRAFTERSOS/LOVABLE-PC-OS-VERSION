
-- Create body_stats table
CREATE TABLE IF NOT EXISTS public.body_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  log_date DATE NOT NULL,
  body_weight_lbs DECIMAL(5,1),
  neck_in DECIMAL(4,1),
  shoulders_in DECIMAL(4,1),
  chest_in DECIMAL(4,1),
  bicep_in DECIMAL(4,1),
  forearm_in DECIMAL(4,1),
  waist_in DECIMAL(4,1),
  hips_in DECIMAL(4,1),
  thigh_in DECIMAL(4,1),
  calf_in DECIMAL(4,1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, log_date)
);

-- Enable RLS
ALTER TABLE public.body_stats ENABLE ROW LEVEL SECURITY;

-- Clients can read their own body stats
CREATE POLICY "clients_select_own_body_stats"
  ON public.body_stats FOR SELECT
  USING (auth.uid() = client_id);

-- Clients can insert their own body stats
CREATE POLICY "clients_insert_own_body_stats"
  ON public.body_stats FOR INSERT
  WITH CHECK (auth.uid() = client_id);

-- Clients can update their own body stats
CREATE POLICY "clients_update_own_body_stats"
  ON public.body_stats FOR UPDATE
  USING (auth.uid() = client_id);

-- Coaches can view body stats for assigned clients
CREATE POLICY "coaches_select_body_stats"
  ON public.body_stats FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.coach_clients cc
      WHERE cc.client_id = body_stats.client_id
        AND cc.coach_id = auth.uid()
        AND cc.status = 'active'
    )
  );

-- Admins can view all body stats
CREATE POLICY "admins_select_all_body_stats"
  ON public.body_stats FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Add measurements_enabled to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS measurements_enabled BOOLEAN DEFAULT false;
