
CREATE TABLE IF NOT EXISTS public.calendar_event_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL,
  note_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, coach_id)
);

ALTER TABLE public.calendar_event_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach can read own event notes"
  ON public.calendar_event_notes
  FOR SELECT
  TO authenticated
  USING (coach_id = auth.uid());

CREATE POLICY "Coach can insert own event notes"
  ON public.calendar_event_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (coach_id = auth.uid());

CREATE POLICY "Coach can update own event notes"
  ON public.calendar_event_notes
  FOR UPDATE
  TO authenticated
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());
