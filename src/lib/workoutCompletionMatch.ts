import { format } from "date-fns";

export interface CompletedSessionRef {
  workout_id: string | null;
  completed_at: string | null;
  session_date?: string | null;
}

/**
 * A scheduled workout counts as done only when it is checked off, or a finished
 * session for that same workout exists on that exact local day. A completion of
 * the same workout on another day (e.g. last week's repeat) never counts.
 */
export function isWorkoutEventDone(
  event: { is_completed: boolean; linked_workout_id?: string | null; event_date?: string },
  sessions: CompletedSessionRef[],
): boolean {
  if (event.is_completed) return true;
  if (!event.linked_workout_id || !event.event_date) return false;
  return sessions.some((s) => {
    if (s.workout_id !== event.linked_workout_id || !s.completed_at) return false;
    const day = s.session_date || format(new Date(s.completed_at), "yyyy-MM-dd");
    return day === event.event_date;
  });
}
