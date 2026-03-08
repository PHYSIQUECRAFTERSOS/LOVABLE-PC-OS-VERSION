
-- Wearable connections per client (Fitbit, Whoop, etc.)
CREATE TABLE IF NOT EXISTS wearable_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('apple_health', 'google_fit', 'fitbit', 'whoop')),
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'idle' CHECK (sync_status IN ('idle', 'syncing', 'error', 'connected')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, provider)
);

-- Health metrics storage (steps + future metrics)
CREATE TABLE IF NOT EXISTS client_health_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  metric_type TEXT NOT NULL CHECK (metric_type IN ('steps', 'heart_rate', 'sleep', 'calories_burned')),
  value NUMERIC NOT NULL,
  recorded_date DATE NOT NULL,
  recorded_at TIMESTAMPTZ,
  provider TEXT NOT NULL,
  source_device TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, metric_type, recorded_date, provider)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_health_metrics_client_date 
  ON client_health_metrics(client_id, metric_type, recorded_date DESC);
CREATE INDEX IF NOT EXISTS idx_wearable_connections_client 
  ON wearable_connections(client_id);

-- RLS: wearable_connections
ALTER TABLE wearable_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can manage own wearable connections"
  ON wearable_connections FOR ALL TO authenticated
  USING (auth.uid() = client_id)
  WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Coaches can view assigned client wearable connections"
  ON wearable_connections FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM coach_clients
      WHERE coach_id = auth.uid() AND client_id = wearable_connections.client_id AND status = 'active'
    )
  );

-- RLS: client_health_metrics
ALTER TABLE client_health_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can read own health metrics"
  ON client_health_metrics FOR SELECT TO authenticated
  USING (auth.uid() = client_id);

CREATE POLICY "Clients can insert own health metrics"
  ON client_health_metrics FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Coaches can read assigned client health metrics"
  ON client_health_metrics FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM coach_clients
      WHERE coach_id = auth.uid() AND client_id = client_health_metrics.client_id AND status = 'active'
    )
  );
