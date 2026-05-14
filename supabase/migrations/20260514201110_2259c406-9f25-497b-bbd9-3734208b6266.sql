ALTER TABLE public.checkin_submissions
  ADD COLUMN IF NOT EXISTS coach_response_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS coach_response_read_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_checkin_submissions_coach_response_unread
  ON public.checkin_submissions (client_id)
  WHERE coach_response IS NOT NULL AND coach_response_read_at IS NULL;