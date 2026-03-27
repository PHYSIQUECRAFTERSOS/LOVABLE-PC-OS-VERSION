

# Supplement Plan System — Master Library + Client Assignment

## Overview

Build a coach-side "Supplement Plans" master library (like Programs) where you create reusable supplement plans with timing instructions, links, discount codes, and coach notes. Then assign entire plans to clients. On the client side, replace the current flat supplement list with a structured, timing-grouped view showing exactly when to take each supplement.

## What You Get

**Coach Side (Master Libraries → "Supplements" tab):**
- Create master supplement items (name, brand, dosage, serving unit, timing slot, link URL, discount code, coach reason/note)
- Group supplements into reusable "Supplement Plans" (e.g., "Reset Phase Supps", "Standard Stack", "Training Only Stack")
- Each plan item has: supplement reference, dosage override, timing (Fasted / With Meal 1 / Pre-Workout / Post-Workout / Before Bed / etc.), and a coach note
- Assign an entire plan to a client with one click (like program assignment)
- Per-client overrides: after assigning a plan, tweak individual dosages or add/remove supplements for that specific client without affecting the master

**Client Side (Nutrition → Supplements tab):**
- Supplements grouped by timing: "Fasted / Morning Ritual", "With Meal 1", "Pre-Workout", "Post-Workout", "Before Bed"
- Each supplement shows: name, brand, dosage, coach's reason, and a tappable link (with discount code badge if applicable)
- Daily logging still works — tap to log servings
- Legion partnership badge + discount code prominently displayed

## Database Changes (3 new tables)

### `master_supplements` — Coach's reusable supplement catalog
```
id, coach_id, name, brand, default_dosage, default_dosage_unit, serving_unit, 
serving_size, link_url, discount_code, discount_label, notes, is_active, created_at
```

### `supplement_plans` — Groupings of supplements (like a program)
```
id, coach_id, name, description, is_template, created_at, updated_at
```

### `supplement_plan_items` — Individual supplement within a plan
```
id, plan_id (FK supplement_plans), master_supplement_id (FK master_supplements),
dosage, dosage_unit, timing_slot (enum: fasted, meal_1, meal_2, pre_workout, 
post_workout, before_bed, with_any_meal), sort_order, coach_note, link_url_override, 
discount_code_override
```

### `client_supplement_assignments` — Plan assigned to a client
```
id, client_id, plan_id (FK supplement_plans), assigned_by, is_active, 
assigned_at, notes
```

### `client_supplement_overrides` — Per-client item tweaks
```
id, assignment_id (FK client_supplement_assignments), 
plan_item_id (FK supplement_plan_items), dosage_override, timing_override, 
coach_note_override, is_removed
```

RLS: coaches can CRUD their own master data; clients can SELECT their assigned plans.

## Files to Create/Edit

### New Files
1. **`src/components/libraries/SupplementLibrary.tsx`** — Master library tab: CRUD master supplements + supplement plans, drag-to-reorder items, assign plan to client dialog
2. **`src/components/nutrition/ClientSupplementPlan.tsx`** — Client-facing view: timing-grouped cards with logging, links, discount badges

### Edited Files
3. **`src/pages/MasterLibraries.tsx`** — Add 6th tab "Supplements" with `<SupplementLibrary />`
4. **`src/components/nutrition/SupplementLogger.tsx`** — When client has an assigned plan, render `<ClientSupplementPlan />` instead of the current flat list. Keep manual-add as fallback for clients with no plan.
5. **`src/components/clients/workspace/NutritionTab.tsx`** or create a new `SuppsTab` in client workspace — Coach can view/edit the client's assigned supplement plan from the client detail page

### Migration
6. **Database migration** — Create the 5 tables above with RLS policies

## Timing Slot Design

Based on your PDF, these are the timing categories:

| Slot | Label | Example from PDF |
|------|-------|-----------------|
| `fasted` | Fasted (Morning Ritual) | ACV + Lemon Juice, Psyllium Husk, Probiotics, Iodine, Creatine, Glutamine |
| `meal_1` | With Meal 1 | Multivitamin (Triumph), Vitamin D3, Fish Oil, Zinc+Copper, Vitamin B Complex |
| `pre_workout` | Pre-Workout | Pulse (optional) |
| `post_workout` | Post-Workout | Magnesium (200mg) |
| `before_bed` | Before Bed | Magnesium (200mg) |
| `with_meal` | With Highest Carb Meal | Berberine |
| `any_time` | Any Time | — |

## Client UI Mockup (text)

```text
┌─────────────────────────────────────┐
│ 💊 My Supplement Plan               │
│ Assigned by Coach Kevin              │
│                                     │
│ ── Fasted (Morning Ritual) ──       │
│ ┌─────────────────────────────────┐ │
│ │ Creatine Monohydrate    5g/day  │ │
│ │ Mix with ACV + lemon juice      │ │
│ │ [WUFITNESS 20% OFF] 🔗         │ │
│ │                        [Log ✓]  │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ Probiotics         25B CFU/day  │ │
│ │ Morning fasted                  │ │
│ │ [WUFITNESS 20% OFF] 🔗         │ │
│ │                        [Log ✓]  │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ── With Meal 1 ──                   │
│ ┌─────────────────────────────────┐ │
│ │ Triumph Multivitamin   3 pills  │ │
│ │ Vitamins help use nutrients...  │ │
│ │ [WUFITNESS 20% OFF] 🔗         │ │
│ │                        [Log ✓]  │ │
│ └─────────────────────────────────┘ │
│ ...                                 │
└─────────────────────────────────────┘
```

## Implementation Order

1. Database migration (5 tables + RLS)
2. `SupplementLibrary.tsx` — master supplement CRUD + plan builder + assign dialog
3. `ClientSupplementPlan.tsx` — client-facing timing-grouped view with logging
4. Wire into `MasterLibraries.tsx` (new tab) and `SupplementLogger.tsx` (conditional render)
5. Add supplement plan view to coach's client workspace

