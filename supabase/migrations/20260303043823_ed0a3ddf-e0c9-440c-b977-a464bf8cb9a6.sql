
-- Make assignment_id nullable so submissions can work without assignments (default weekly check-in)
ALTER TABLE public.checkin_submissions ALTER COLUMN assignment_id DROP NOT NULL;

-- Add week_number and PST timestamp columns
ALTER TABLE public.checkin_submissions 
  ADD COLUMN IF NOT EXISTS week_number integer,
  ADD COLUMN IF NOT EXISTS submitted_at_pst text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS coach_response text;

-- Add template_id directly to submissions for non-assignment-based check-ins
ALTER TABLE public.checkin_submissions
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.checkin_templates(id);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_checkin_submissions_client_id ON public.checkin_submissions(client_id);
CREATE INDEX IF NOT EXISTS idx_checkin_submissions_status ON public.checkin_submissions(status);
CREATE INDEX IF NOT EXISTS idx_checkin_submissions_submitted_at ON public.checkin_submissions(submitted_at);
CREATE INDEX IF NOT EXISTS idx_checkin_submissions_template_id ON public.checkin_submissions(template_id);
CREATE INDEX IF NOT EXISTS idx_checkin_responses_submission_id ON public.checkin_responses(submission_id);
CREATE INDEX IF NOT EXISTS idx_checkin_questions_template_id ON public.checkin_questions(template_id);

-- RLS policies for checkin_submissions (add missing ones)
-- Coaches can view submissions from their clients
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Coaches view client submissions' AND tablename = 'checkin_submissions') THEN
    CREATE POLICY "Coaches view client submissions" ON public.checkin_submissions
      FOR SELECT TO authenticated
      USING (
        client_id IN (
          SELECT client_id FROM public.coach_clients WHERE coach_id = auth.uid() AND status = 'active'
        )
        OR public.has_role(auth.uid(), 'admin')
      );
  END IF;
END $$;

-- Clients can view their own submissions  
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Clients view own submissions' AND tablename = 'checkin_submissions') THEN
    CREATE POLICY "Clients view own submissions" ON public.checkin_submissions
      FOR SELECT TO authenticated
      USING (client_id = auth.uid());
  END IF;
END $$;

-- Clients can insert their own submissions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Clients insert own submissions' AND tablename = 'checkin_submissions') THEN
    CREATE POLICY "Clients insert own submissions" ON public.checkin_submissions
      FOR INSERT TO authenticated
      WITH CHECK (client_id = auth.uid());
  END IF;
END $$;

-- Coaches can update submissions (mark reviewed, add notes)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Coaches update client submissions' AND tablename = 'checkin_submissions') THEN
    CREATE POLICY "Coaches update client submissions" ON public.checkin_submissions
      FOR UPDATE TO authenticated
      USING (
        client_id IN (
          SELECT client_id FROM public.coach_clients WHERE coach_id = auth.uid() AND status = 'active'
        )
        OR public.has_role(auth.uid(), 'admin')
      );
  END IF;
END $$;

-- Clients can insert their own responses
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Clients insert own responses' AND tablename = 'checkin_responses') THEN
    CREATE POLICY "Clients insert own responses" ON public.checkin_responses
      FOR INSERT TO authenticated
      WITH CHECK (
        submission_id IN (
          SELECT id FROM public.checkin_submissions WHERE client_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Everyone authenticated can read checkin_questions for templates they have access to
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated read checkin questions' AND tablename = 'checkin_questions') THEN
    CREATE POLICY "Authenticated read checkin questions" ON public.checkin_questions
      FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;

-- Everyone authenticated can read active templates
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated read active templates' AND tablename = 'checkin_templates') THEN
    CREATE POLICY "Authenticated read active templates" ON public.checkin_templates
      FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;

-- Coaches can manage templates
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Coaches manage own templates' AND tablename = 'checkin_templates') THEN
    CREATE POLICY "Coaches manage own templates" ON public.checkin_templates
      FOR ALL TO authenticated
      USING (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
      WITH CHECK (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

-- Coaches can manage questions on their templates
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Coaches manage template questions' AND tablename = 'checkin_questions') THEN
    CREATE POLICY "Coaches manage template questions" ON public.checkin_questions
      FOR ALL TO authenticated
      USING (
        template_id IN (
          SELECT id FROM public.checkin_templates WHERE coach_id = auth.uid()
        )
        OR public.has_role(auth.uid(), 'admin')
      )
      WITH CHECK (
        template_id IN (
          SELECT id FROM public.checkin_templates WHERE coach_id = auth.uid()
        )
        OR public.has_role(auth.uid(), 'admin')
      );
  END IF;
END $$;

-- Coaches can read responses on their client submissions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Coaches read client responses' AND tablename = 'checkin_responses') THEN
    CREATE POLICY "Coaches read client responses" ON public.checkin_responses
      FOR SELECT TO authenticated
      USING (
        submission_id IN (
          SELECT id FROM public.checkin_submissions WHERE client_id IN (
            SELECT client_id FROM public.coach_clients WHERE coach_id = auth.uid() AND status = 'active'
          )
        )
        OR public.has_role(auth.uid(), 'admin')
      );
  END IF;
END $$;

-- Clients can read their own responses
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Clients read own responses' AND tablename = 'checkin_responses') THEN
    CREATE POLICY "Clients read own responses" ON public.checkin_responses
      FOR SELECT TO authenticated
      USING (
        submission_id IN (
          SELECT id FROM public.checkin_submissions WHERE client_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Enable RLS on all tables (idempotent)
ALTER TABLE public.checkin_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkin_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkin_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkin_responses ENABLE ROW LEVEL SECURITY;
