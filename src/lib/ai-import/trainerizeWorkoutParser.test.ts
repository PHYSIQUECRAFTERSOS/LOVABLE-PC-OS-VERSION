import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { extractTrainerizeWorkoutSummary, prependTrainerizeWorkoutSummary } from "./trainerizeWorkoutParser";

const workoutBlock = (name: string, firstExercise: string) => `
${name}
Regular workout Created by Kevin Wu on 19 Jun 2026, last updated on 19 Jun 2026.
est. 45 minutes
Instructions
Warmup
Tempo [2:0:1:0]
${name}
Superset of 3 sets
▶ ${firstExercise} 10-12 reps
▶ Pectoralis Chest Stretch 30 seconds/side
Rest for 60 sec
Repeat new set
▶ Single arm dumbbell row 3 sets x 12-15 reps Rest 90 sec between sets
Tracking Sheet (Print and track your progress here. Don't forget to enter them online.)
Exercise Name Set 1 Set 2 Set 3
${firstExercise} reps x lbs reps x lbs reps x lbs
Pectoralis Chest Stretch reps x lbs reps x lbs reps x lbs
Single arm dumbbell row reps x lbs reps x lbs reps x lbs
Previous Stats
EXERCISE
`;

describe("trainerize workout parser", () => {
  it("keeps Trainerize workout boundaries to exactly 9 workouts", () => {
    const text = `
Physique Crafters 2026-06-23, 10:31 PM
https://teaminspirez.trainerize.com/app/PrintTrackingLog.aspx#workoutPlanID=1
Phase 2: Drop set hotel workouts on the go
${workoutBlock("[AWAY]Day 1: Upper", "Dumbbell Underhand Row")}
${workoutBlock("[AWAY]Day 2: Legs A & Core A", "Dumbbell Goblet squat")}
${workoutBlock("[AWAY]Day 3: Upper", "helms row")}
${workoutBlock("[AWAY]Day 4: Lower & Core", "Heels Elevated Dumbbell Front Squat")}
${workoutBlock("Day 1: UPPER A", "flat SMITH MACHINE BENCH PRESS")}
${workoutBlock("Day 2: LOWER A & calves & abs", "smith machine back squats")}
${workoutBlock("Day 3: UPPER B", "incline smith machine bench")}
${workoutBlock("Day 4 : LOWER B & calves & abs", "lying leg curls")}
${workoutBlock("stretches", "Trap stretch")}
`;

    const summary = extractTrainerizeWorkoutSummary(text);

    expect(summary?.workouts.map((w) => w.day_name)).toEqual([
      "[AWAY]Day 1: Upper",
      "[AWAY]Day 2: Legs A & Core A",
      "[AWAY]Day 3: Upper",
      "[AWAY]Day 4: Lower & Core",
      "Day 1: UPPER A",
      "Day 2: LOWER A & calves & abs",
      "Day 3: UPPER B",
      "Day 4 : LOWER B & calves & abs",
      "Stretches",
    ]);
    expect(summary?.schedule).toHaveLength(9);
    expect(summary?.workouts.every((w) => w.exercises.length >= 3)).toBe(true);
  });

  it("prepends a boundary summary for the edge function", () => {
    const text = `Physique Crafters\ntrainerize.com\n${workoutBlock("[AWAY]Day 1: Upper", "Row")}\n${workoutBlock("Day 1: UPPER A", "Press")}`;

    expect(prependTrainerizeWorkoutSummary(text)).toMatch(/^<<<TRAINERIZE_WORKOUT_BOUNDARY_SUMMARY_JSON>>>/);
  });

  it("parses Lee's 4-day PDF (no ▶ prefix on exercise rows)", () => {
    const text = fs.readFileSync(
      path.join(__dirname, "__fixtures__", "lee-4-day.txt"),
      "utf-8",
    );
    const summary = extractTrainerizeWorkoutSummary(text);
    expect(summary).not.toBeNull();
    const names = summary!.workouts.map((w) => w.day_name);
    expect(names).toEqual([
      "Day 1: Chest & Back & arms A",
      "Day 2: Shoulders & Legs A & Calves & core A",
      "Day 3: Chest & Back & arms B",
      "Day 4: Shoulders & Legs A & Calves & core B",
    ]);

    const day1 = summary!.workouts[0];
    const day1Names = day1.exercises.map((e) => e.name.toLowerCase());
    expect(day1Names).toContain("upper body mobility routine");
    expect(day1Names).toContain("flat dumbbell bench press");
    expect(day1Names).toContain("machine neutral row");
    expect(day1Names.some((n) => n.includes("lying dumbbell curl"))).toBe(true);
    expect(day1Names.some((n) => n.includes("lying dumbbell tricep"))).toBe(true);

    const day3 = summary!.workouts[2];
    const day3Names = day3.exercises.map((e) => e.name.toLowerCase());
    expect(day3Names.some((n) => n.includes("dumbbell hammer curl"))).toBe(true);
    expect(day3Names.some((n) => n.includes("smith machine close grip bench"))).toBe(true);

    // Bench press in Day 1: 3 sets x 8-10 reps, 120s rest
    const bench = day1.exercises.find((e) => /flat dumbbell bench press/i.test(e.name))!;
    expect(bench.sets).toBe(3);
    expect(bench.reps).toMatch(/8\s*-\s*10/);
    expect(bench.rest_seconds).toBe(120);
  });
});
