/**
 * Formats a human-readable serving display string for the meal list.
 * Display-only — does NOT affect macro calculations.
 */

const GENERIC_UNITS = new Set(["g", "gram", "grams", "serving", "servings", "ml", ""]);

function pluralize(word: string, qty: number): string {
  if (qty === 1) return word;
  const lower = word.toLowerCase();
  if (lower.endsWith("s") || lower.endsWith("x") || lower.endsWith("z")) return word + "es";
  if (lower.endsWith("ch") || lower.endsWith("sh")) return word + "es";
  return word + "s";
}

/**
 * Pluralizes the LAST word of a multi-word label.
 * "egg white" → "egg whites", "slice" → "slices"
 */
function pluralizeLabel(label: string, qty: number): string {
  if (qty === 1) return label;
  const parts = label.trimEnd().split(/\s+/);
  if (parts.length === 0) return label;
  parts[parts.length - 1] = pluralize(parts[parts.length - 1], qty);
  return parts.join(" ");
}

interface FoodInfo {
  serving_label?: string | null;
  serving_size?: number;
  serving_unit?: string;
  name?: string;
}

/**
 * @param food - food_items record fields (serving_label, serving_size, serving_unit, name)
 * @param quantityDisplay - nutrition_logs.quantity_display
 * @param quantityUnit - nutrition_logs.quantity_unit
 * @param servings - nutrition_logs.servings (fallback)
 * @returns display string like "4 egg whites" or "200g"
 */
export function formatServingDisplay(
  food: FoodInfo | null,
  quantityDisplay: number | null | undefined,
  quantityUnit: string | null | undefined,
  servings: number
): string {
  const qu = quantityUnit ?? "";
  const qd = quantityDisplay;

  // 1. If food has a natural serving_label (e.g. "croissant", "egg white")
  if (food?.serving_label && !GENERIC_UNITS.has(food.serving_label.toLowerCase().trim())) {
    const count = qu === "serving"
      ? (qd != null && qd > 0 ? qd : servings)
      : (qd != null && qd > 0 ? qd : servings);
    const displayCount = Math.round(count * 10) / 10;
    return `${displayCount} ${pluralizeLabel(food.serving_label, displayCount)}`;
  }

  // 2. Gram-based quantity (qu === "g" or direct gram entry)
  if (qu === "g" && qd != null && qd > 0) {
    return `${Math.round(qd * 10) / 10}g`;
  }

  // 3. Oz-based quantity
  if (qu === "oz" && qd != null && qd > 0) {
    return `${Math.round(qd * 10) / 10} oz`;
  }

  // 4. Serving-based with gram serving_unit — show total grams
  if (qu === "serving" && food) {
    const count = qd != null && qd > 0 ? qd : servings;
    const displayCount = Math.round(count * 10) / 10;
    const su = (food.serving_unit ?? "g").toLowerCase();

    if (su === "g" || su === "grams" || su === "ml") {
      // For small whole-number servings, show "N serving(s)" instead of gram total
      // unless it's truly a bulk gram food (serving_size >= 100 typical)
      const totalWeight = Math.round(displayCount * (food.serving_size || 100));
      const unit = su === "ml" ? "ml" : "g";
      return `${totalWeight}${unit}`;
    }

    // Non-metric unit (piece, slice, etc.)
    return `${displayCount} ${pluralize("serving", displayCount)}`;
  }

  // 5. Other explicit quantity_unit
  if (qd != null && qd > 0 && qu) {
    return `${Math.round(qd * 10) / 10} ${qu}`;
  }

  // 6. Raw quantity_display with no unit
  if (qd != null && qd > 0) {
    return `${Math.round(qd * 10) / 10}g`;
  }

  // 7. Fallback: use food serving info
  if (food) {
    const count = Math.round(servings * 10) / 10;
    if (food.serving_label && !GENERIC_UNITS.has(food.serving_label.toLowerCase().trim())) {
      return `${count} ${pluralizeLabel(food.serving_label, count)}`;
    }
    const size = food.serving_size || 100;
    const unit = (food.serving_unit ?? "g") === "ml" ? "ml" : "g";
    return `${Math.round(count * size)}${unit}`;
  }

  // 8. Absolute fallback
  if (servings === 0) return "0 servings";
  const s = Math.round(servings * 10) / 10;
  return `${s} ${pluralize("serving", s)}`;
}
