/**
 * Decides what to do with a stale `in_progress` workout session
 * (heartbeat older than the resume window).
 *
 * Context: iOS can suspend the webview the moment the app is backgrounded,
 * so a "finish workout" write occasionally never lands even though the
 * client did the work. Blindly marking those sessions "abandoned" makes a
 * completed workout show as unchecked and orphans the logged sets — clients
 * experience this as "my workout got unchecked".
 *
 * Rule: a stale session with real logged work (sets recorded over a
 * meaningful duration) is RECOVERED to "completed". A stale session with
 * no logged sets is a true orphan and is abandoned as before.
 */

export interface StaleSessionInfo {
  started_at: string | null;
  last_heartbeat: string | null;
  loggedSets: number;
}

export type StaleSessionAction = "complete" | "abandon";

export interface StaleSessionDecision {
  action: StaleSessionAction;
  /** Completion timestamp to persist when action === "complete". */
  completedAt: string | null;
  /** Whole seconds the session was active, when known. */
  durationSeconds: number | null;
}

/** Minimum open time before logged sets count as a real workout. */
export const MIN_MEANINGFUL_DURATION_MS = 10 * 60 * 1000;

export function classifyStaleSession(session: StaleSessionInfo): StaleSessionDecision {
  const start = session.started_at ? Date.parse(session.started_at) : NaN;
  const end = session.last_heartbeat ? Date.parse(session.last_heartbeat) : NaN;
  const hasWindow = Number.isFinite(start) && Number.isFinite(end) && end > start;
  const durationMs = hasWindow ? end - start : 0;

  if (session.loggedSets > 0 && durationMs >= MIN_MEANINGFUL_DURATION_MS) {
    return {
      action: "complete",
      completedAt: new Date(end).toISOString(),
      durationSeconds: Math.round(durationMs / 1000),
    };
  }
  return { action: "abandon", completedAt: null, durationSeconds: null };
}
