
-- Auto message templates (reusable message content)
CREATE TABLE public.auto_message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  name text NOT NULL,
  content text NOT NULL,
  category text NOT NULL DEFAULT 'motivational', -- motivational, reminder, milestone, custom
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger configurations (what events fire messages)
CREATE TABLE public.auto_message_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  template_id uuid NOT NULL REFERENCES public.auto_message_templates(id) ON DELETE CASCADE,
  trigger_type text NOT NULL, -- missed_workout, missed_checkin, inactivity_7d, goal_milestone, recurring, broadcast
  target_type text NOT NULL DEFAULT 'all_clients', -- all_clients, tag_group, individual
  target_tag text, -- for tag_group targeting
  target_client_id uuid, -- for individual targeting
  recurrence_cron text, -- for recurring: e.g. "0 9 * * 1" (Mon 9am)
  is_active boolean NOT NULL DEFAULT true,
  last_evaluated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Log of all sent automated messages
CREATE TABLE public.auto_message_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id uuid REFERENCES public.auto_message_triggers(id) ON DELETE SET NULL,
  template_id uuid REFERENCES public.auto_message_templates(id) ON DELETE SET NULL,
  coach_id uuid NOT NULL,
  client_id uuid NOT NULL,
  message_content text NOT NULL,
  trigger_reason text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.auto_message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_message_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_message_logs ENABLE ROW LEVEL SECURITY;

-- Templates policies
CREATE POLICY "Coaches can manage own templates" ON public.auto_message_templates
  FOR ALL USING (coach_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- Triggers policies
CREATE POLICY "Coaches can manage own triggers" ON public.auto_message_triggers
  FOR ALL USING (coach_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- Logs policies
CREATE POLICY "Coaches can view sent logs" ON public.auto_message_logs
  FOR ALL USING (coach_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view own message logs" ON public.auto_message_logs
  FOR SELECT USING (client_id = auth.uid());

-- Triggers for updated_at
CREATE TRIGGER update_auto_message_templates_updated_at BEFORE UPDATE ON public.auto_message_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_auto_message_triggers_updated_at BEFORE UPDATE ON public.auto_message_triggers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
