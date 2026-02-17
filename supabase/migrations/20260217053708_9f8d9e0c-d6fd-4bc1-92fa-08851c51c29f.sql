
-- Health connections: tracks user's linked health sources
CREATE TABLE public.health_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  provider text NOT NULL, -- 'apple_health' or 'google_fit'
  is_connected boolean NOT NULL DEFAULT false,
  permissions_granted text[] NOT NULL DEFAULT '{}',
  connected_at timestamp with time zone,
  disconnected_at timestamp with time zone,
  last_sync_at timestamp with time zone,
  sync_status text NOT NULL DEFAULT 'idle', -- 'idle', 'syncing', 'error'
  sync_error text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider)
);

ALTER TABLE public.health_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own connections"
  ON public.health_connections FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Coaches can view client connections"
  ON public.health_connections FOR SELECT
  USING (has_role(auth.uid(), 'coach') OR has_role(auth.uid(), 'admin'));

-- Daily health metrics: stores aggregated daily data
CREATE TABLE public.daily_health_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  metric_date date NOT NULL,
  steps integer,
  walking_running_distance_km numeric,
  active_energy_kcal numeric,
  step_goal integer DEFAULT 10000,
  -- Future phase columns (structured now)
  sleep_duration_min numeric,
  resting_heart_rate integer,
  hrv_ms numeric,
  weight_kg numeric,
  vo2_max numeric,
  -- Metadata
  source text NOT NULL DEFAULT 'health_api', -- 'health_api', 'manual'
  synced_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, metric_date)
);

ALTER TABLE public.daily_health_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own metrics"
  ON public.daily_health_metrics FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Coaches can view client metrics"
  ON public.daily_health_metrics FOR SELECT
  USING (has_role(auth.uid(), 'coach') OR has_role(auth.uid(), 'admin'));

-- Enable realtime for dashboard updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_health_metrics;

-- Trigger for updated_at
CREATE TRIGGER update_health_connections_updated_at
  BEFORE UPDATE ON public.health_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_daily_health_metrics_updated_at
  BEFORE UPDATE ON public.daily_health_metrics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
