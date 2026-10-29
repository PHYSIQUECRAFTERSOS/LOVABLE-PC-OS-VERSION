# Fix "Could not detect food" in Meal Scan

## Diagnosis (confirmed from the scan logs)
The photos are fine. The AI correctly identifies the food (e.g. "Plain 0% Greek Yogurt 200g", "Legion Whey+ scoop", "Cinnamon Toast Crunch 1 cup"), but its answer gets **cut off mid-sentence** before it finishes. The app can't read a half-finished answer, so it shows "Could not detect food."

Why it got worse recently: the AI model now spends part of its word budget "thinking" before answering, and that counts against a hard limit set in the scan. With 2–3 foods the answer runs out of room. More items on a plate means more failures.

## Fix
1. Raise the answer length limit and turn off the hidden "thinking" step so the full answer always fits (also makes scans faster).
2. Ask the AI for a strict structured answer (no extra formatting) so it's always readable.
3. If an answer is still cut off, salvage every complete food item instead of throwing all of them away.
4. Retry once automatically if the answer can't be read at all, before showing the error.
5. Log when an answer was cut off, so we can spot this immediately in future.

## Technical details
- `supabase/functions/meal-scan/index.ts`: `max_tokens` 1000 → 4000, `reasoning: { effort: "none" }` / thinking budget 0, `response_format: { type: "json_object" }`, check `finish_reason === "length"`, tolerant parser (strip fences, extract complete objects from `items` array), one retry on parse failure.
- No database or app-screen changes; `MealScanCapture.tsx` unchanged.
- Verify by calling the deployed function with a multi-item food photo and checking logs.
