// Milestone catalog (mirrors badges seeded in DB) — used for client-side display only.
// Source of truth is the `badges` table (category + threshold).

export type MilestoneCategory =
  | "workout_count"
  | "cardio_count"
  | "nutrition_total"
  | "nutrition_streak";

export type MilestoneTier = "bronze" | "silver" | "gold" | "platinum" | "diamond";

export const CATEGORY_META: Record<
  MilestoneCategory,
  { label: string; unit: string; verb: string; sublabel: string }
> = {
  workout_count: {
    label: "Workouts",
    unit: "workouts",
    verb: "completed",
    sublabel: "You just hit",
  },
  cardio_count: {
    label: "Cardio",
    unit: "cardio sessions",
    verb: "completed",
    sublabel: "You just hit",
  },
  nutrition_total: {
    label: "Days Logged",
    unit: "days logged",
    verb: "logged",
    sublabel: "You just hit",
  },
  nutrition_streak: {
    label: "Streak",
    unit: "day streak",
    verb: "in a row",
    sublabel: "You're on a",
  },
};

export const TIER_RING: Record<MilestoneTier, string> = {
  bronze: "from-amber-700 via-amber-500 to-amber-700",
  silver: "from-zinc-400 via-zinc-200 to-zinc-400",
  gold: "from-[#8a6b13] via-[#D4A017] to-[#f5e6a8]",
  platinum: "from-cyan-200 via-white to-cyan-200",
  diamond: "from-cyan-300 via-fuchsia-200 to-cyan-300",
};

export const HYPE_LINES = [
  "Let's GOOO 🔥",
  "Built different.",
  "Triple O Method in motion.",
  "This is what showing up looks like.",
  "Unstoppable.",
  "Locked in.",
  "Earned, not given.",
];

export function pickHypeLine(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return HYPE_LINES[h % HYPE_LINES.length];
}
