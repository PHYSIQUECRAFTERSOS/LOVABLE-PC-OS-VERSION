/**
 * Shared helper to extract micronutrient values from a food_items record
 * and scale them by a multiplier for insertion into nutrition_logs.
 *
 * The food_items table stores absolute values per serving.
 * The nutrition_logs table stores absolute values for the logged amount.
 */

// All micronutrient column keys shared between food_items and nutrition_logs
const MICRO_KEYS = [
  "vitamin_a_mcg", "vitamin_c_mg", "vitamin_d_mcg", "vitamin_e_mg", "vitamin_k_mcg",
  "vitamin_b1_mg", "vitamin_b2_mg", "vitamin_b3_mg", "vitamin_b5_mg", "vitamin_b6_mg",
  "vitamin_b7_mcg", "vitamin_b9_mcg", "vitamin_b12_mcg",
  "calcium_mg", "iron_mg", "magnesium_mg", "phosphorus_mg", "potassium_mg",
  "zinc_mg", "copper_mg", "manganese_mg", "selenium_mcg", "chromium_mcg",
  "molybdenum_mcg", "iodine_mcg", "omega_3", "omega_6",
  "cholesterol", "saturated_fat", "trans_fat", "monounsaturated_fat", "polyunsaturated_fat",
  "added_sugars", "alcohol", "net_carbs", "soluble_fiber", "insoluble_fiber",
] as const;

/**
 * Given a food_items record (or partial), extract micronutrient fields
 * scaled by `multiplier`. Returns an object safe to spread into a
 * nutrition_logs insert.
 *
 * @param foodItem - A record from the food_items table (can be partial/any)
 * @param multiplier - Scale factor (e.g., 2 for 2 servings)
 * @returns Object with only non-zero micro values
 */
export function extractMicros(
  foodItem: Record<string, any> | null | undefined,
  multiplier: number = 1
): Record<string, number> {
  if (!foodItem) return {};

  const result: Record<string, number> = {};
  for (const key of MICRO_KEYS) {
    const val = foodItem[key];
    if (val != null && typeof val === "number" && val > 0) {
      result[key] = Math.round(val * multiplier * 100) / 100;
    }
  }
  return result;
}

/**
 * List of micronutrient column names to include in SELECT queries
 * when fetching food_items for logging purposes.
 */
export const MICRO_SELECT_COLUMNS = MICRO_KEYS.join(", ");

/**
 * Full SELECT string for food_items including macros + micros
 */
export const FOOD_ITEM_FULL_SELECT = [
  "id", "name", "brand", "serving_size", "serving_unit", "serving_label",
  "calories", "protein", "carbs", "fat", "fiber", "sugar", "sodium",
  "is_verified", "data_source", "category", "barcode",
  ...MICRO_KEYS,
].join(", ");
