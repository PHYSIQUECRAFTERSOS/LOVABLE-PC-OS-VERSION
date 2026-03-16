
-- Create checkin_reviewers table
CREATE TABLE IF NOT EXISTS public.checkin_reviewers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#D4A017',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.checkin_reviewers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage their own reviewers"
  ON public.checkin_reviewers
  FOR ALL
  TO authenticated
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

-- Create client_reviewer_assignments table
CREATE TABLE IF NOT EXISTS public.client_reviewer_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  reviewer_id uuid NOT NULL REFERENCES public.checkin_reviewers(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id)
);

ALTER TABLE public.client_reviewer_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage their client reviewer assignments"
  ON public.client_reviewer_assignments
  FOR ALL
  TO authenticated
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

-- Add reviewed_by column to checkin_submissions
ALTER TABLE public.checkin_submissions
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.checkin_reviewers(id) ON DELETE SET NULL;
