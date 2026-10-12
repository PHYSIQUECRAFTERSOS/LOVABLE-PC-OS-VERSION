import { describe, it, expect } from "vitest";
import { computeClientPhaseStatuses, isOverdue } from "@/lib/clientPhaseStatus";

// Jose's layout: current phase first, old finished phases listed after it.
const phases = [
  { id: "p3", program_id: "x", name: "Phase 3", phase_order: 1, duration_weeks: 8, start_date: null },
  { id: "p1", program_id: "x", name: "Phase 1", phase_order: 2, duration_weeks: 8, start_date: "2026-04-26" },
  { id: "p2", program_id: "x", name: "Phase 2", phase_order: 3, duration_weeks: 8, start_date: null },
];
const run = (today: string, ph = phases) =>
  computeClientPhaseStatuses(
    ["c"],
    [{ client_id: "c", program_id: "x", start_date: "2026-08-16" }],
    [{ id: "x", start_date: "2026-08-16" }],
    ph as any,
    today,
  ).get("c")!;

describe("phase deadlines", () => {
  it("old finished phases listed later are not counted as queued", () => {
    expect(run("2026-10-08").next).toBeNull();
  });
  it("client is overdue once the last real phase has ended", () => {
    expect(isOverdue(run("2026-10-12"))).toBe(true);
  });
  it("a genuine future phase still counts as queued", () => {
    const withFuture = [...phases, { id: "p4", program_id: "x", name: "Phase 4", phase_order: 4, duration_weeks: 8, start_date: "2099-01-01" }];
    expect(run("2026-10-08", withFuture).next?.id).toBe("p4");
  });
  it("client with no program has state none", () => {
    expect(computeClientPhaseStatuses(["c"], [], [], []).get("c")!.state).toBe("none");
  });
});
