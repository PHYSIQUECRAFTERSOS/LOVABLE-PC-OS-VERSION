
-- Performance indexes on frequently filtered columns
CREATE INDEX IF NOT EXISTS idx_coach_clients_client_id ON public.coach_clients(client_id);
CREATE INDEX IF NOT EXISTS idx_coach_clients_coach_id ON public.coach_clients(coach_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_weight_logs_client_id ON public.weight_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_client_id ON public.workout_sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_weekly_checkins_client_id ON public.weekly_checkins(client_id);
CREATE INDEX IF NOT EXISTS idx_exercise_logs_session_id ON public.exercise_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_progress_photos_client_id ON public.progress_photos(client_id);
CREATE INDEX IF NOT EXISTS idx_body_measurements_client_id ON public.body_measurements(client_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_id ON public.calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_health_metrics_user_id ON public.daily_health_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_client_notes_client_id ON public.client_notes(client_id);
CREATE INDEX IF NOT EXISTS idx_client_tags_client_id ON public.client_tags(client_id);
CREATE INDEX IF NOT EXISTS idx_cardio_logs_client_id ON public.cardio_logs(client_id);

-- invite token indexes
CREATE INDEX IF NOT EXISTS idx_client_invites_token ON public.client_invites(invite_token);
CREATE INDEX IF NOT EXISTS idx_client_invites_email ON public.client_invites(email);
CREATE INDEX IF NOT EXISTS idx_staff_invites_token ON public.staff_invites(invite_token);
CREATE INDEX IF NOT EXISTS idx_staff_invites_email ON public.staff_invites(email);

-- compound indexes for common queries
CREATE INDEX IF NOT EXISTS idx_coach_clients_status ON public.coach_clients(coach_id, status);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user ON public.conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_conv ON public.conversation_participants(conversation_id);

-- date-based query indexes
CREATE INDEX IF NOT EXISTS idx_workout_sessions_created ON public.workout_sessions(client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_weight_logs_logged ON public.weight_logs(client_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_checkins_date ON public.weekly_checkins(client_id, week_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_health_metrics_date ON public.daily_health_metrics(user_id, metric_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON public.calendar_events(user_id, event_date);
