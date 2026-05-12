/**
 * Phase date derivation + formatting helpers.
 *
 * State B: program_phases has duration_weeks but no start/end columns.
 * Dates are computed sequentially from programs.start_date.
 *
 * Coach Authority: if a phase ever ships with explicit start/end, those
 * pre-set values are preserved.
 */

export interface PhaseLike {
  id: string;
  phase_order: number;
  duration_weeks: number;
  start_date?: string | null;
  end_date?: string | null;
}

export interface DerivedPhaseDates {
  start_date: string | null; // YYYY-MM-DD local
  end_date: string | null;
  isUpcoming: boolean;
  isCurrent: boolean;
  isCompleted: boolean;
  daysLeft: number | null; // only for current; null otherwise
}

/** Parse YYYY-MM-DD as a local-midnight Date (no UTC drift). */
function parseLocal(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, (m || 1) - 1, day || 1);
}

/** Format a Date back to YYYY-MM-DD (local). */
function toLocalYMD(d: Date): string {
  return d.toLocaleDateString("en-CA");
}

/** Add N days to a YYYY-MM-DD string and return YYYY-MM-DD. */
function addDays(ymd: string, days: number): string {
  const d = parseLocal(ymd);
  d.setDate(d.getDate() + days);
  return toLocalYMD(d);
}

/** Format a YYYY-MM-DD string as "DD MMM YYYY" (en-CA). */
export function formatPhaseDate(ymd: string | null | undefined): string {
  if (!ymd) return "";
  const d = parseLocal(ymd);
  // en-CA → "May 19, 2025" by default; we want "19 May 2025".
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

export function formatPhaseDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  if (!start || !end) return "";
  return `${formatPhaseDate(start)} - ${formatPhaseDate(end)}`;
}

/**
 * Compute start/end + status for each phase, in phase_order, starting from
 * programStartDate. Returns a map keyed by phase id.
 */
export function derivePhaseDates(
  programStartDate: string | null | undefined,
  phases: PhaseLike[],
): Record<string, DerivedPhaseDates> {
  const out: Record<string, DerivedPhaseDates> = {};
  if (!programStartDate || !phases.length) {
    for (const p of phases) {
      out[p.id] = {
        start_date: p.start_date || null,
        end_date: p.end_date || null,
        isUpcoming: false,
        isCurrent: false,
        isCompleted: false,
        daysLeft: null,
      };
    }
    return out;
  }

  const sorted = [...phases].sort((a, b) => a.phase_order - b.phase_order);
  const today = new Date().toLocaleDateString("en-CA");
  let cursor = programStartDate;

  for (const p of sorted) {
    // Coach Authority: respect explicit dates if ever stored.
    const start = p.start_date || cursor;
    const weeks = Math.max(1, p.duration_weeks || 1);
    const end = p.end_date || addDays(start, weeks * 7 - 1);

    const isCompleted = end < today;
    const isUpcoming = start > today;
    const isCurrent = !isCompleted && !isUpcoming;

    let daysLeft: number | null = null;
    if (isCurrent) {
      const ms = parseLocal(end).getTime() - parseLocal(today).getTime();
      daysLeft = Math.ceil(ms / 86400000);
    }

    out[p.id] = { start_date: start, end_date: end, isUpcoming, isCurrent, isCompleted, daysLeft };
    cursor = addDays(end, 1);
  }
  return out;
}

/** Convenience: program-level range = MIN(start) → MAX(end) of derived phases. */
export function deriveProgramRange(
  programStart: string | null | undefined,
  programEnd: string | null | undefined,
  derived: Record<string, DerivedPhaseDates>,
): { start: string | null; end: string | null } {
  const starts = Object.values(derived).map((d) => d.start_date).filter(Boolean) as string[];
  const ends = Object.values(derived).map((d) => d.end_date).filter(Boolean) as string[];
  return {
    start: programStart || (starts.length ? starts.sort()[0] : null),
    end: programEnd || (ends.length ? ends.sort()[ends.length - 1] : null),
  };
}

/** Render countdown text for a current phase. */
export function formatDaysLeft(daysLeft: number | null): string {
  if (daysLeft === null) return "";
  if (daysLeft < 0) return "";
  if (daysLeft === 0) return "Ends today";
  if (daysLeft === 1) return "1 day left";
  return `${daysLeft} days left`;
}
