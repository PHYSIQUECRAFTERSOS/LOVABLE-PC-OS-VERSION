

# Improve Exercise Search in Workout Builder Modal

## Problem
The exercise search in `WorkoutBuilderModal.tsx` uses `string.includes()`, which only matches contiguous substrings. Searching "incline bench" fails to find "incline smith machine bench press" because the words aren't adjacent. Same for "incline fly" not finding "incline machine chest fly".

## Solution
Replace the single `includes()` check with a **multi-word tokenized search** — split the query into individual words and require ALL words to appear somewhere in the exercise name (in any order). This matches how most search UIs work.

**File**: `src/components/training/WorkoutBuilderModal.tsx` (line ~551)

Change:
```typescript
const matchSearch = !searchQuery || ex.name.toLowerCase().includes(searchQuery.toLowerCase());
```

To:
```typescript
const matchSearch = !searchQuery || (() => {
  const name = ex.name.toLowerCase();
  const tokens = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
  return tokens.every(token => name.includes(token));
})();
```

This means:
- "incline bench" → matches any name containing both "incline" AND "bench" → finds "incline smith machine bench press" ✓
- "incline fly" → matches "incline machine chest fly" ✓
- "smith shoulder" → matches "smith machine shoulder press" ✓

Also apply the same fix to `ClientWorkoutEditorModal.tsx` which has the same search pattern.

