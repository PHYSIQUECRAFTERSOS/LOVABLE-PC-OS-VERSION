
-- Performance: add indexes on hot query paths surfaced by slow-query report

-- calendar_events: filtered constantly by event_date + event_type on dashboard/Today
CREATE INDEX IF NOT EXISTS idx_calendar_events_date_type
  ON public.calendar_events (event_date, event_type);

CREATE INDEX IF NOT EXISTS idx_calendar_events_target_client_date
  ON public.calendar_events (target_client_id, event_date)
  WHERE target_client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_calendar_events_user_date
  ON public.calendar_events (user_id, event_date);

CREATE INDEX IF NOT EXISTS idx_calendar_events_linked_workout
  ON public.calendar_events (linked_workout_id)
  WHERE linked_workout_id IS NOT NULL;

-- thread_messages: unread badge counts (thread_id + sender_id + read_at)
CREATE INDEX IF NOT EXISTS idx_thread_messages_thread_sender_unread
  ON public.thread_messages (thread_id, sender_id, read_at);

CREATE INDEX IF NOT EXISTS idx_thread_messages_sender_read
  ON public.thread_messages (sender_id, read_at)
  WHERE read_at IS NULL;

-- nutrition_logs: per-client per-day queries (dashboard, macro rings)
CREATE INDEX IF NOT EXISTS idx_nutrition_logs_client_logged_at
  ON public.nutrition_logs (client_id, logged_at);

-- meal_plan_items: ordered fetch by plan
CREATE INDEX IF NOT EXISTS idx_meal_plan_items_plan_order
  ON public.meal_plan_items (meal_plan_id, meal_order, item_order);

-- supplement_plan_items: ordered fetch by plan
CREATE INDEX IF NOT EXISTS idx_supplement_plan_items_plan_order
  ON public.supplement_plan_items (plan_id, timing_slot, sort_order);

-- workout_sessions: coach-side history queries by client + recency
CREATE INDEX IF NOT EXISTS idx_workout_sessions_client_created
  ON public.workout_sessions (client_id, created_at DESC);

-- coach_clients: dashboard/roster lookup by coach + status
CREATE INDEX IF NOT EXISTS idx_coach_clients_coach_status
  ON public.coach_clients (coach_id, status);

-- client_risk_scores: admin dashboard fetch by client_id + recency
CREATE INDEX IF NOT EXISTS idx_client_risk_scores_client_calculated
  ON public.client_risk_scores (client_id, calculated_at DESC);
