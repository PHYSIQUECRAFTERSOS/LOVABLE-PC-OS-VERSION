/**
 * Local snapshot of the workout currently being tracked.
 *
 * iOS can reload the webview while the app is backgrounded, which wipes all
 * in-memory state and closes the tracker. Persisting the resolved workout
 * plan lets "Resume Workout" open instantly — no spinner, no network — while
 * the server copy revalidates in the background.
 */

const KEY_PREFIX = "pc:activeWorkout:";
const MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4h — beyond this the session is stale anyway

export interface WorkoutSnapshot {
  workoutId: string;
  workoutName: string;
  instructions: string | null;
  exercises: any[];
  resumeSessionId: string | null;
  calendarEventId: string | null;
  savedAt: number;
}

function key(userId: string) {
  return `${KEY_PREFIX}${userId}`;
}

export function saveWorkoutSnapshot(userId: string | undefined, snap: Omit<WorkoutSnapshot, "savedAt">) {
  if (!userId) return;
  try {
    localStorage.setItem(key(userId), JSON.stringify({ ...snap, savedAt: Date.now() }));
  } catch {
    /* quota / private mode — non-fatal */
  }
}

export function readWorkoutSnapshot(
  userId: string | undefined,
  workoutId?: string,
): WorkoutSnapshot | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return null;
    const snap = JSON.parse(raw) as WorkoutSnapshot;
    if (!snap?.workoutId || !Array.isArray(snap.exercises) || snap.exercises.length === 0) return null;
    if (Date.now() - (snap.savedAt ?? 0) > MAX_AGE_MS) {
      clearWorkoutSnapshot(userId);
      return null;
    }
    if (workoutId && snap.workoutId !== workoutId) return null;
    return snap;
  } catch {
    return null;
  }
}

export function clearWorkoutSnapshot(userId?: string) {
  try {
    if (userId) {
      localStorage.removeItem(key(userId));
      return;
    }
    // No user id available (completion paths) — clear any active snapshots.
    Object.keys(localStorage)
      .filter((k) => k.startsWith(KEY_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
