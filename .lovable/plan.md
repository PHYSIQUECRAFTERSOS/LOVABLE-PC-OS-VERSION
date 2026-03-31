

## Plan: Editable Gram Inputs on Nutrition Goal Modal

### Problem
The sliders only move in 1% steps, making it impossible to hit exact gram targets (e.g., 281g protein). This creates discrepancies between meal plan totals and nutrition goals, confusing clients who see non-zero "remaining" values despite following their plan exactly.

### Solution
Make the gram values (e.g., "278g") clickable/editable inline inputs. When the user types an exact gram value, the system reverse-calculates the percentage and updates the slider + other macros accordingly. The calories field becomes the anchor — typing grams recalculates percentages, and typing percentages (via slider) recalculates grams.

### Approach — Grams as Source of Truth

Currently, percentages are the source of truth and grams are derived. We need to support **both directions**:

1. **Replace the static `{grams.protein}g` text** with a small inline `<Input>` that shows the gram value
2. **On gram input change**: reverse-calculate the percentage as `(grams * caloriesPerGram / totalCalories) * 100`, then redistribute remaining percentage across the other two mac