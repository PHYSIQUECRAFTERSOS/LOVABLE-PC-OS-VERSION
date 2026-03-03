
-- Fix: Allow coaches to manage calendar events for their assigned clients
CREATE POLICY "Coaches can insert events for clients"
ON public.calendar_events
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'coach') AND (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.coach_clients
      WHERE coach_clients.coach_id = auth.uid()
      AND coach_clients.client_id = calendar_events.user_id
    )
  )
);

CREATE POLICY "Coaches can update client events"
ON public.calendar_events
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'coach') AND (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.coach_clients
      WHERE coach_clients.coach_id = auth.uid()
      AND coach_clients.client_id = calendar_events.user_id
    )
  )
);

CREATE POLICY "Coaches can delete client events"
ON public.calendar_events
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'coach') AND (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.coach_clients
      WHERE coach_clients.coach_id = auth.uid()
      AND coach_clients.client_id = calendar_events.user_id
    )
  )
);

-- Also allow admins full access
CREATE POLICY "Admins can manage all calendar events"
ON public.calendar_events
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
