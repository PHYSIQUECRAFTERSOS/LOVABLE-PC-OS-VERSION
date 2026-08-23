-- Drop redundant/duplicate indexes. Each dropped index is an exact duplicate
-- or its leftmost prefix is fully covered by another index on the same table,
-- so read queries keep an equivalent plan while writes maintain fewer indexes.
DROP INDEX IF EXISTS public.idx_calendar_events_date;               -- exact dup of idx_calendar_events_user_date
DROP INDEX IF EXISTS public.idx_calendar_events_user_id;            -- covered by (user_id, event_date)
DROP INDEX IF EXISTS public.idx_calendar_events_target_client_date; -- partial dup of idx_calendar_events_target_date
DROP INDEX IF EXISTS public.idx_nutrition_logs_client_date;         -- exact dup of idx_nutrition_logs_client_logged_at
DROP INDEX IF EXISTS public.idx_thread_messages_thread_id;          -- covered by (thread_id, created_at)
DROP INDEX IF EXISTS public.idx_client_risk_scores_client_calculated; -- covered by unique (client_id, calculated_at)
DROP INDEX IF EXISTS public.idx_risk_scores_client_date;            -- same coverage
DROP INDEX IF EXISTS public.idx_workout_sessions_client_id;         -- covered by (client_id, ...) composites
DROP INDEX IF EXISTS public.idx_workout_sessions_created;           -- dup of (client_id, created_at DESC); btrees scan both directions
DROP INDEX IF EXISTS public.idx_weight_logs_client_id;              -- covered by unique (client_id, logged_at)
DROP INDEX IF EXISTS public.idx_weight_logs_logged;                 -- dup of unique (client_id, logged_at)

-- Refresh planner statistics: pg_stat shows 0 live tuples on hot tables, which
-- makes the planner choose full sequential scans (observed: 6,926 seq scans on
-- user_roles). ANALYZE is read-only and safe to run in a transaction.
ANALYZE public.user_roles;
ANALYZE public.profiles;
ANALYZE public.thread_messages;
ANALYZE public.message_threads;
ANALYZE public.calendar_events;
ANALYZE public.nutrition_logs;
ANALYZE public.workout_sessions;
ANALYZE public.weight_logs;
ANALYZE public.coach_clients;
ANALYZE public.client_risk_scores;