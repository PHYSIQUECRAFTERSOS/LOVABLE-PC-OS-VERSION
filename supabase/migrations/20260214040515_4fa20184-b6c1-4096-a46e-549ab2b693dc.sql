
-- Client Risk Scores: daily CRI per client
CREATE TABLE public.client_risk_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  score integer NOT NULL DEFAULT 0,
  risk_level text NOT NULL DEFAULT 'low',
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculated_at date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, calculated_at)
);

ALTER TABLE public.client_risk_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches and admins can view risk scores"
  ON public.client_risk_scores FOR SELECT
  USING (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage risk scores"
  ON public.client_risk_scores FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Retention Nudges: tracks sent nudges and effectiveness
CREATE TABLE public.retention_nudges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  nudge_type text NOT NULL DEFAULT 'motivational',
  risk_level_at_send text NOT NULL,
  message text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  reengaged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.retention_nudges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own nudges"
  ON public.retention_nudges FOR SELECT
  USING (client_id = auth.uid());

CREATE POLICY "Coaches and admins can manage nudges"
  ON public.retention_nudges FOR ALL
  USING (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Recommit Events: tracks recommitment flow completion
CREATE TABLE public.recommit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  step_completed integer NOT NULL DEFAULT 1,
  micro_action text,
  public_post text,
  streak_reset boolean NOT NULL DEFAULT false,
  badge_awarded boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recommit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can manage own recommit events"
  ON public.recommit_events FOR ALL
  USING (client_id = auth.uid());

CREATE POLICY "Coaches and admins can view recommit events"
  ON public.recommit_events FOR SELECT
  USING (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Index for fast lookups
CREATE INDEX idx_risk_scores_client_date ON public.client_risk_scores (client_id, calculated_at DESC);
CREATE INDEX idx_risk_scores_level ON public.client_risk_scores (risk_level, calculated_at DESC);
CREATE INDEX idx_nudges_client ON public.retention_nudges (client_id, sent_at DESC);
CREATE INDEX idx_recommit_client ON public.recommit_events (client_id, created_at DESC);
