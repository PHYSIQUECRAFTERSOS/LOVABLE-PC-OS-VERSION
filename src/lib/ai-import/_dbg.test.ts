import { describe, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { extractTrainerizeWorkoutSummary } from "./trainerizeWorkoutParser";
describe("dbg", () => {
  it("dumps", () => {
    const t = fs.readFileSync(path.join(__dirname, "__fixtures__", "lee-4-day.txt"), "utf-8");
    const s = extractTrainerizeWorkoutSummary(t)!;
    for (const w of s.workouts) {
      console.log("##", w.day_name);
      for (const e of w.exercises) console.log(" -", e.name, "| sets="+e.sets, "reps="+e.reps, "rest="+e.rest_seconds, "g="+(e.grouping_id||"-"));
    }
  });
});
