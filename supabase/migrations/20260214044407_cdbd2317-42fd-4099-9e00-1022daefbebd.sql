
-- Create all tables first
CREATE TABLE public.checkin_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.checkin_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.checkin_templates(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  question_type text NOT NULL DEFAULT 'text',
  options jsonb,
  scale_min integer DEFAULT 1,
  scale_max integer DEFAULT 10,
  is_required boolean NOT NULL DEFAULT true,
  question_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.checkin_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.checkin_templates(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL,
  client_id uuid NOT NULL,
  recurrence text NOT NULL DEFAULT 'weekly',
  day_of_week integer DEFAULT 0,
  deadline_hours integer DEFAULT 48,
  is_active boolean NOT NULL DEFAULT true,
  next_due_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.checkin_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.checkin_assignments(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  due_date date NOT NULL,
  submitted_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  coach_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.checkin_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.checkin_submissions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.checkin_questions(id) ON DELETE CASCADE,
  answer_text text,
  answer_numeric numeric,
  answer_scale integer,
  answer_boolean boolean,
  answer_choice text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.checkin_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkin_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkin_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkin_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkin_responses ENABLE ROW LEVEL SECURITY;

-- Templates policies
CREATE POLICY "Coaches can manage templates" ON public.checkin_templates
  FOR ALL USING (coach_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view assigned templates" ON public.checkin_templates
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.checkin_assignments ca WHERE ca.template_id = checkin_templates.id AND ca.client_id = auth.uid())
  );

-- Questions policies
CREATE POLICY "Coaches can manage questions" ON public.checkin_questions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.checkin_templates ct WHERE ct.id = checkin_questions.template_id AND (ct.coach_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)))
  );

CREATE POLICY "Clients can view assigned questions" ON public.checkin_questions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.checkin_assignments ca WHERE ca.template_id = checkin_questions.template_id AND ca.client_id = auth.uid())
  );

-- Assignments policies
CREATE POLICY "Coaches can manage assignments" ON public.checkin_assignments
  FOR ALL USING (coach_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view own assignments" ON public.checkin_assignments
  FOR SELECT USING (client_id = auth.uid());

-- Submissions policies
CREATE POLICY "Clients can manage own submissions" ON public.checkin_submissions
  FOR ALL USING (client_id = auth.uid());

CREATE POLICY "Coaches can view and update submissions" ON public.checkin_submissions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.checkin_assignments ca WHERE ca.id = checkin_submissions.assignment_id AND (ca.coach_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)))
  );

-- Responses policies
CREATE POLICY "Clients can manage own responses" ON public.checkin_responses
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.checkin_submissions cs WHERE cs.id = checkin_responses.submission_id AND cs.client_id = auth.uid())
  );

CREATE POLICY "Coaches can view responses" ON public.checkin_responses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.checkin_submissions cs
      JOIN public.checkin_assignments ca ON ca.id = cs.assignment_id
      WHERE cs.id = checkin_responses.submission_id AND (ca.coach_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
    )
  );

-- Triggers
CREATE TRIGGER update_checkin_templates_updated_at BEFORE UPDATE ON public.checkin_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_checkin_assignments_updated_at BEFORE UPDATE ON public.checkin_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
