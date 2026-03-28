CREATE TABLE IF NOT EXISTS public.tag_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  tag_name text NOT NULL,
  message_content text NOT NULL DEFAULT '',
  email_subject text,
  email_body text,
  send_email boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coach_id, tag_name)
);

ALTER TABLE public.tag_automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view own tag automations"
  ON public.tag_automations FOR SELECT
  TO authenticated
  USING (coach_id = auth.uid());

CREATE POLICY "Coaches can insert own tag automations"
  ON public.tag_automations FOR INSERT
  TO authenticated
  WITH CHECK (coach_id = auth.uid());

CREATE POLICY "Coaches can update own tag automations"
  ON public.tag_automations FOR UPDATE
  TO authenticated
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

CREATE POLICY "Coaches can delete own tag automations"
  ON public.tag_automations FOR DELETE
  TO authenticated
  USING (coach_id = auth.uid());

CREATE TRIGGER update_tag_automations_updated_at
  BEFORE UPDATE ON public.tag_automations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();