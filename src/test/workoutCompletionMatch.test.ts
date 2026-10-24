import { describe, it, expect } from "vitest";
import { isWorkoutEventDone } from "@/lib/workoutCompletionMatch";
import { parseLocalDate } from "@/utils/localDate";
import { format } from "date-fns";

describe("isWorkoutEventDone", () => {
  const ev = { is_completed: false, linked_workout_id: "pullB", event_date: "2026-10-22" };
  it("last week's PULL B (Oct 15) does not mark Oct 22 done", () => {
    expect(isWorkoutEventDone(ev, [{ workout_id: "pullB", completed_at: "2026-10-15T20:00:00", session_date: "2026-10-15" }])).toBe(false);
  });
  it("a finished session on the same local day marks it done", () => {
    expect(isWorkoutEventDone(ev, [{ workout_id: "pullB", completed_at: "2026-10-22T18:00:00", session_date: "2026-10-22" }])).toBe(true);
  });
});

describe("event date display", () => {
  it("2026-10-22 shows as Oct 22", () => {
    expect(format(parseLocalDate("2026-10-22"), "d MMM")).toBe("22 Oct");
  });
});
