CREATE OR REPLACE FUNCTION public.coach_unread_thread_count(_coach_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.message_threads t
  WHERE t.coach_id = _coach_id
    AND t.is_archived = false
    AND (
      t.coach_marked_unread = true
      OR EXISTS (
        SELECT 1 FROM public.thread_messages m
        WHERE m.thread_id = t.id
          AND m.sender_id = t.client_id
          AND (t.coach_last_seen_at IS NULL OR m.created_at > t.coach_last_seen_at)
      )
    )
$$;

REVOKE ALL ON FUNCTION public.coach_unread_thread_count(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.coach_unread_thread_count(uuid) TO authenticated;