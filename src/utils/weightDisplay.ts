/**
 * Utility for coach-facing weight display with kg→lbs conversion.
 * Clients always see their own units unchanged.
 * Coaches see lbs as primary with original kg shown as secondary.
 */

const KG_TO_LBS = 2.20462;

export interface WeightDisplay {
  primary: string;       // e.g. "176.4 lbs" or "185 lbs"
  secondary: string | null; // e.g. "80 kg" (only when conversion happened)
}

export function formatWeightForCoach(
  value: number | null | undefined,
  unit: string = "lbs"
): WeightDisplay {
  if (value == null) return { primary: "—", secondary: null };
  if (value === 0) return { primary: "BW", secondary: null };

  if (unit === "kg") {
    const lbs = Math.round(value * KG_TO_LBS * 10) / 10;
    return {
      primary: `${lbs} lbs`,
      secondary: `${value} kg`,
    };
  }

  return { primary: `${value} lbs`, secondary: null };
}

/**
 * For client-facing display — just show their raw value + unit.
 */
export function formatWeightForClient(
  value: number | null | undefined,
  unit: string = "lbs"
): string {
  if (value == null) return "—";
  if (value === 0) return "BW";
  return `${value} ${unit}`;
}
