
-- Calendar events table for custom events, rest days, reminders, and scheduled items
CREATE TABLE public.calendar_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL DEFAULT 'custom',
  event_date DATE NOT NULL,
  event_time TIME,
  end_time TIME,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurrence_pattern TEXT, -- daily, weekly, biweekly, monthly, custom
  recurrence_days INTEGER[], -- 0=Sun, 1=Mon, etc.
  recurrence_end_date DATE,
  color TEXT,
  linked_workout_id UUID REFERENCES public.workouts(id) ON DELETE SET NULL,
  linked_cardio_id UUID REFERENCES public.cardio_assignments(id) ON DELETE SET NULL,
  linked_checkin_id UUID REFERENCES public.checkin_assignments(id) ON DELETE SET NULL,
  target_client_id UUID, -- for coach scheduling for a client
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

-- Users can manage own events
CREATE POLICY "Users can manage own events"
ON public.calendar_events
FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Clients can view events scheduled for them by coaches
CREATE POLICY "Clients can view scheduled events"
ON public.calendar_events
FOR SELECT
USING (target_client_id = auth.uid());

-- Clients can update completion status of events scheduled for them
CREATE POLICY "Clients can complete scheduled events"
ON public.calendar_events
FOR UPDATE
USING (target_client_id = auth.uid())
WITH CHECK (target_client_id = auth.uid());

-- Coaches can view events for their clients
CREATE POLICY "Coaches can view client events"
ON public.calendar_events
FOR SELECT
USING (
  has_role(auth.uid(), 'coach') AND EXISTS (
    SELECT 1 FROM public.coach_clients
    WHERE coach_clients.coach_id = auth.uid()
    AND coach_clients.client_id = calendar_events.target_client_id
  )
);

-- Indexes
CREATE INDEX idx_calendar_events_user_date ON public.calendar_events(user_id, event_date);
CREATE INDEX idx_calendar_events_target_date ON public.calendar_events(target_client_id, event_date);
CREATE INDEX idx_calendar_events_type ON public.calendar_events(event_type);

-- Updated_at trigger
CREATE TRIGGER update_calendar_events_updated_at
BEFORE UPDATE ON public.calendar_events
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
