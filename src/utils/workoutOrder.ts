/**
 * Workout chronological ordering helpers.
 *
 * Goal: drop the auto "Day N" numbering and instead order workouts by the
 * "Day N" prefix embedded in the user-authored workout name (Trainerize-style).
 *
 * Examples that are considered chronological:
 *   - "Day 1: UPPER"
 *   - "Day 2 - LOWER A"
 *   - "Day 3 Push"
 *
 * Anything that does NOT begin with "Day <number>" (e.g.
 * "(Tweaked Shoulder) Day 3: Push", "Hotel Substitute", "Bonus Core")
 * is treated as an "other" entry and pushed below the chronological list,
 * sorted by sort_order (then name) to keep coach-defined ordering stable.
 */

const LEADING_DAY_RE = /^\s*Day\s*(\d+)\s*[:\-–]?\s*/i;

export function parseLeadingDay(name: string): number | null {
  if (!name) return null;
  const m = name.match(LEADING_DAY_RE);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

export interface OrderableWorkout {
  name: string;
  sort_order?: number | null;
  exclude_from_numbering?: boolean | null;
  custom_tag?: string | null;
}

/**
 * Sort a workout list "Trainerize-style":
 *   1. Items whose name starts with "Day N" come first, ordered by N.
 *   2. Items with a custom tag (excluded from numbering) come next.
 *   3. Everything else falls to the bottom, ordered by sort_order then name.
 */
export function sortWorkoutsChronologically<T extends OrderableWorkout>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ad = parseLeadingDay(a.name);
    const bd = parseLeadingDay(b.name);

    // Chronological bucket — both have leading Day numbers.
    if (ad != null && bd != null) {
      if (ad !== bd) return ad - bd;
      return a.name.localeCompare(b.name);
    }
    if (ad != null) return -1;
    if (bd != null) return 1;

    // Neither has a leading Day. Tag-suffixed items rank above plain "other".
    const aTagged = !!a.exclude_from_numbering;
    const bTagged = !!b.exclude_from_numbering;
    if (aTagged && !bTagged) return -1;
    if (!aTagged && bTagged) return 1;

    return (
      (a.sort_order ?? 999) - (b.sort_order ?? 999) ||
      a.name.localeCompare(b.name)
    );
  });
}
