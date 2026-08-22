import { describe, it, expect } from "vitest";
import { classifyStaleSession } from "@/lib/sessionRecovery";

const iso = (ms: number) => new Date(ms).toISOString();
const t0 = Date.parse("2026-08-21T12:50:00Z");
const t1 = Date.parse("2026-08-21T13:32:15Z"); // 42 min later

describe("classifyStaleSession", () => {
  it("recovers a stale session with real logged work (the reported bug)", () => {
    const d = classifyStaleSession({ started_at: iso(t0), last_heartbeat: iso(t1), loggedSets: 25 });
    expect(d.action).toBe("complete");
    expect(d.completedAt).toBe(iso(t1));
    expect(d.durationSeconds).toBe(Math.round((t1 - t0) / 1000));
  });

  it("abandons a true orphan with no logged sets", () => {
    const d = classifyStaleSession({ started_at: iso(t0), last_heartbeat: iso(t1), loggedSets: 0 });
    expect(d.action).toBe("abandon");
    expect(d.completedAt).toBeNull();
  });

  it("abandons when logged sets exist but the session was open < 10 min", () => {
    const short = t0 + 5 * 60 * 1000;
    const d = classifyStaleSession({ started_at: iso(t0), last_heartbeat: iso(short), loggedSets: 3 });
    expect(d.action).toBe("abandon");
  });

  it("abandons when timestamps are missing or inverted", () => {
    expect(classifyStaleSession({ started_at: null, last_heartbeat: iso(t1), loggedSets: 5 }).action).toBe("abandon");
    expect(classifyStaleSession({ started_at: iso(t1), last_heartbeat: iso(t0), loggedSets: 5 }).action).toBe("abandon");
  });
});
