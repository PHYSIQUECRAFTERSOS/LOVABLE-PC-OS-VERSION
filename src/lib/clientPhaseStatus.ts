/**
 * Shared phase-status resolver for the coach dashboard and the client list.
 *
 * Single source of truth for "what phase is this client on, and is there a
 * queued next phase?" Both the dashboard's Training Phase Deadlines card
 * and the Clients list page derive their answers from this helper to
 * eliminate the dashboard / client-list divergence that produced false
 * positives in the Overdue / Due Within 7 Days lists.
 *
 * Notes:
 * - Dates are resolved with derivePhaseDates() (today vs programs.start_date
 *   + cumulative duration_weeks). The denormalized
 *   client_program_assignments.current_phase_id field is intentionally
 *   NOT consulted — it is known to go stale on phase transitions.
 * - A "next phase queued" is purely structural: any phase in the same
 *   program with phase_order greater than the resolved current phase.
 */

import { derivePhaseDates, type PhaseLike } from "./phaseDates";
import { getLocalDateString } from "@/utils/localDate";

export interface AssignmentRow {
  client_id: string;
  program_id: string;
  start_date: string | null;
}

export interface ProgramRow {
  id: string;
  start_date: string | null;
}

export interface PhaseRow extends PhaseLike {
  program_id: string;
  name: string;
}

export interface ResolvedPhase {
  id: string;
  name: string;
  phase_order: number;
  start_date: string; // YYYY-MM-DD local
  end_date: string;
}

export type PhaseState =
  | "current" // a phase covers today
  | "upcoming" // program hasn't started yet
  | "ended" // program fully completed (no current, no next)
  | "none"; // no program/phases at all

export interface ClientPhaseStatus {
  clientId: string;
  state: PhaseState;
  current: ResolvedPhase | null;
  /** Earliest phase in the same program with phase_order > current. */
  next: ResolvedPhase | null;
  /** Most recently ended phase across the client's active programs (used to date "overdue"). */
  mostRecentEnded: ResolvedPhase | null;
  /** Days from today until current.end_date (negative once overdue). null if no current. */
  daysLeft: number | null;
}

function ymdToDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function diffDays(fromYmd: string, toYmd: string): number {
  return Math.round(
    (ymdToDate(toYmd).getTime() - ymdToDate(fromYmd).getTime()) / 86400000,
  );
}

/**
 * Compute phase status for every client in `clientIds`. Inputs are the
 * raw rows from Supabase (already filtered to active/subscribed
 * assignments on the caller's side). Pure function — safe to memoize.
 */
export function computeClientPhaseStatuses(
  clientIds: string[],
  assignments: AssignmentRow[],
  programs: ProgramRow[],
  phases: PhaseRow[],
  today: string = getLocalDateString(),
): Map<string, ClientPhaseStatus> {
  const programStartById = new Map<string, string | null>();
  programs.forEach((p) => programStartById.set(p.id, p.start_date || null));

  const phasesByProgram = new Map<string, PhaseRow[]>();
  phases.forEach((p) => {
    if (!phasesByProgram.has(p.program_id)) phasesByProgram.set(p.program_id, []);
    phasesByProgram.get(p.program_id)!.push(p);
  });

  const out = new Map<string, ClientPhaseStatus>();
  for (const cid of clientIds) {
    out.set(cid, {
      clientId: cid,
      state: "none",
      current: null,
      next: null,
      mostRecentEnded: null,
      daysLeft: null,
    });
  }

  // A client can technically have multiple active assignments. We pick the
  // assignment whose resolved state is best (current > upcoming > ended),
  // with current.end_date as the tiebreaker.
  for (const a of assignments) {
    const acc = out.get(a.client_id);
    if (!acc) continue;
    const programPhases = phasesByProgram.get(a.program_id);
    if (!programPhases?.length) continue;

    const sorted = [...programPhases].sort(
      (x, y) => x.phase_order - y.phase_order,
    );
    const programStart =
      programStartById.get(a.program_id) || a.start_date || null;
    if (!programStart) continue;

    const derived = derivePhaseDates(programStart, sorted as PhaseLike[]);

    const toResolved = (p: PhaseRow): ResolvedPhase | null => {
      const dd = derived[p.id];
      if (!dd?.start_date || !dd?.end_date) return null;
      return {
        id: p.id,
        name: p.name,
        phase_order: p.phase_order,
        start_date: dd.start_date,
        end_date: dd.end_date,
      };
    };

    let current: ResolvedPhase | null = null;
    let next: ResolvedPhase | null = null;
    let mostRecentEnded: ResolvedPhase | null = null;
    let upcoming: ResolvedPhase | null = null;

    for (const p of sorted) {
      const dd = derived[p.id];
      if (!dd?.start_date || !dd?.end_date) continue;
      const r = toResolved(p)!;
      if (dd.isCurrent) current = r;
      else if (dd.isUpcoming) {
        if (!upcoming || r.start_date < upcoming.start_date) upcoming = r;
      } else if (dd.isCompleted) {
        if (!mostRecentEnded || r.end_date > mostRecentEnded.end_date)
          mostRecentEnded = r;
      }
    }

    if (current) {
      const after = sorted
        .filter((p) => p.phase_order > current!.phase_order)
        .map(toResolved)
        .filter((r): r is ResolvedPhase => !!r)
        .sort((a, b) => a.start_date.localeCompare(b.start_date));
      next = after[0] || null;
    } else if (upcoming) {
      // Program not yet started — the upcoming phase is the "current".
      current = upcoming;
      const after = sorted
        .filter((p) => p.phase_order > upcoming!.phase_order)
        .map(toResolved)
        .filter((r): r is ResolvedPhase => !!r)
        .sort((a, b) => a.start_date.localeCompare(b.start_date));
      next = after[0] || null;
    }

    const daysLeft = current ? diffDays(today, current.end_date) : null;

    // State priority: current > upcoming > ended > none.
    let candidateState: PhaseState;
    if (current && upcoming === current) candidateState = "upcoming";
    else if (current) candidateState = "current";
    else if (mostRecentEnded) candidateState = "ended";
    else candidateState = "none";

    const priority: Record<PhaseState, number> = {
      current: 4,
      upcoming: 3,
      ended: 2,
      none: 1,
    };
    if (priority[candidateState] >= priority[acc.state]) {
      out.set(a.client_id, {
        clientId: a.client_id,
        state: candidateState,
        current,
        next,
        mostRecentEnded: mostRecentEnded || acc.mostRecentEnded,
        daysLeft,
      });
    } else if (mostRecentEnded && !acc.mostRecentEnded) {
      acc.mostRecentEnded = mostRecentEnded;
    }
  }

  return out;
}

/** Convenience: a client is "due" within N days when current phase ends in [0, N] and no next is queued. */
export function isDueWithin(status: ClientPhaseStatus, days = 7): boolean {
  if (status.state !== "current" || status.daysLeft === null) return false;
  if (status.daysLeft < 0 || status.daysLeft > days) return false;
  return !status.next;
}

/** Overdue: program ended (no current covers today) AND no future phase queued. */
export function isOverdue(status: ClientPhaseStatus): boolean {
  if (status.state === "ended" && !status.next) return true;
  // Edge case: current resolved but already past end (daysLeft < 0) — shouldn't
  // happen with derivePhaseDates, but guard anyway.
  if (
    status.state === "current" &&
    status.daysLeft !== null &&
    status.daysLeft < 0 &&
    !status.next
  ) {
    return true;
  }
  return false;
}
