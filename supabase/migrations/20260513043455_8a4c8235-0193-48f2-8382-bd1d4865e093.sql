-- Sleep logs table
CREATE TABLE IF NOT EXISTS public.sleep_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  sleep_date date NOT NULL,
  total_minutes integer,
  in_bed_minutes integer,
  asleep_minutes integer,
  deep_minutes integer,
  rem_minutes integer,
  light_minutes integer,
  awake_minutes integer,
  bedtime_at timestamptz,
  wake_at timestamptz,
  source text NOT NULL DEFAULT 'manual',
  source_priority integer NOT NULL DEFAULT 0,
  raw_payload jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sleep_logs_client_date_unique UNIQUE (client_id, sleep_date)
);

CREATE INDEX IF NOT EXISTS idx_sleep_logs_client_date
  ON public.sleep_logs (client_id, sleep_date DESC);

ALTER TABLE public.sleep_logs ENABLE ROW LEVEL SECURITY;

-- Client: full CRUD on own rows
CREATE POLICY "Clients view own sleep"
  ON public.sleep_logs FOR SELECT
  USING (auth.uid() = client_id);

CREATE POLICY "Clients insert own sleep"
  ON public.sleep_logs FOR INSERT
  WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Clients update own sleep"
  ON public.sleep_logs FOR UPDATE
  USING (auth.uid() = client_id);

CREATE POLICY "Clients delete own sleep"
  ON public.sleep_logs FOR DELETE
  USING (auth.uid() = client_id);

-- Coach: view assigned clients' sleep
CREATE POLICY "Coaches view assigned client sleep"
  ON public.sleep_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.coach_clients cc
      WHERE cc.client_id = sleep_logs.client_id
        AND cc.coach_id = auth.uid()
        AND cc.status = 'active'
    )
  );

-- Admin: view all
CREATE POLICY "Admins view all sleep"
  ON public.sleep_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Updated-at trigger
CREATE TRIGGER trg_sleep_logs_updated_at
  BEFORE UPDATE ON public.sleep_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();