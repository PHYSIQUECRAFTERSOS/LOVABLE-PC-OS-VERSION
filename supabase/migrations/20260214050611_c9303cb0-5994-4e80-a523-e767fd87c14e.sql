
-- Table for AI body fat estimates
CREATE TABLE public.ai_body_fat_estimates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  photo_ids UUID[] NOT NULL DEFAULT '{}',
  estimated_bf_pct NUMERIC NOT NULL,
  confidence_low NUMERIC NOT NULL,
  confidence_high NUMERIC NOT NULL,
  ai_notes TEXT,
  lighting_warning BOOLEAN NOT NULL DEFAULT false,
  coach_override_pct NUMERIC,
  coach_notes TEXT,
  coach_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_body_fat_estimates ENABLE ROW LEVEL SECURITY;

-- Clients can view own estimates
CREATE POLICY "Clients can view own estimates"
  ON public.ai_body_fat_estimates
  FOR SELECT
  USING (client_id = auth.uid());

-- Clients can insert own estimates
CREATE POLICY "Clients can insert own estimates"
  ON public.ai_body_fat_estimates
  FOR INSERT
  WITH CHECK (client_id = auth.uid());

-- Coaches can view all estimates
CREATE POLICY "Coaches can view estimates"
  ON public.ai_body_fat_estimates
  FOR SELECT
  USING (has_role(auth.uid(), 'coach') OR has_role(auth.uid(), 'admin'));

-- Coaches can update (for override)
CREATE POLICY "Coaches can update estimates"
  ON public.ai_body_fat_estimates
  FOR UPDATE
  USING (has_role(auth.uid(), 'coach') OR has_role(auth.uid(), 'admin'));

-- Index for quick lookups
CREATE INDEX idx_ai_bf_estimates_client ON public.ai_body_fat_estimates (client_id, created_at DESC);
