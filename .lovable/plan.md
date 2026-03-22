

# Plan: Three Coach-Side Improvements

## 1. Remove "Programs" from Coach Navigation

The coach sidebar currently shows a "Programs" link (pointing to `/pricing`) in `coachSecondaryNav`. This is a client-facing pricing page and should not appear for coaches.

**File: `src/components/AppLayout.tsx`**
- Remove `{ to: "/pricing", icon: CreditCard, label: "Programs" }` from `coachSecondaryNav` (line 73).
- Keep it in `clientNav` since clients need it.

---

## 2. Fix Meal Plan Saving in Client Profile

The `MealPlanBuilder` already has full save logic that works when `clientId` is passed. After investigating the code, the save function at line 539 looks correct — it handles both new inserts and updates to existing plans.

The likely issue is that `planName` is empty when building from the client profile, because the builder initializes `planName` to `""` and the save guard `if (!user || !planName) return` silently blocks the save.

**File: `src/components/nutrition/MealPlanBuilder.tsx`**
- When `clientId` and `dayTypeLabel` are provided (client profile context), auto-set `planName` to the `dayTypeLabel` (e.g., "Training Day") so the save button works without requiring the coach to manually type a name.
- Make the plan name field pre-populated with the day type label when in client context.

---

## 3. Add "Build from Scratch" Option in Client Training Tab

Currently, the Training tab only allows assigning from existing master programs. When no program is assigned, the only option is "Assign Program" which opens a dialog to pick a master template.

**File: `src/components/clients/workspace/TrainingTab.tsx`**
- Add a "Build from Scratch" button alongside "Assign Program" in the empty state.
- "