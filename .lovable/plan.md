

## Import Scott Szeto's Trainerize Data into Master Libraries

This plan uses a script to directly insert data into your database — no manual entry needed. It will create the training program, meal plan template, and supplement plan in your Master Libraries as shared items.

### What Gets Created

**1. Training Program: "Phase 6: Drop Sets" (Shared)**

A program with 1 phase containing 4 workouts, plus a "Day 2: Lower (adjusted)" variant:

- **Day 1: Upper & Core** — Stomach Vacuum, Upper Body Mobility, Lying Dumbbell Row (3x10-12), Incline Machine Chest Press (3x8-10), Dumbbell Chest Fly (3x10-12 drop set), Rope Lat Pullovers (3x12-15 drop set), Superset: Dumbbell Hammer Curls + Cuffed Single Arm Cross Body Tricep Extension (3x10-12/8-10), Superset: Pike + Cable Rope Crunch (3x10-12/12-15), Pectoralis Chest Stretch, Upper Trapezius Stretch
- **Day 2: Lower** — Stomach Vacuum, Lower Body Mobility, Ankle Mobility (2x8), Heel Elevated Smith Machine Back Squats (3x10-12), Leg Press Glute Focus (3x8-10), Bulgarian Split Squat (3x10-12), Dumbbell Straight Leg Deadlift (3x10-12), Leg Extensions (3x12-15 drop set), Seated Calf Raise (2x12-15)
- **Day 2: Lower (adjusted)** — Stomach Vacuum, Lower Body Mobility, Ankle Mobility (2x8), Heels Elevated Dumbbell Front Squat (3x10-12), Dumbbell Split Squats (3x10-12), Dumbbell Romanian Deadlift (3x12-15), Leg Extensions (3x12-15), Wall Leaning Calf Raise (3x15-20)
- **Day 3: Full Body & Core** — Stomach Vacuum, Full Body Mobility, Ankle Mobility (1x8), Flat Smith Machine Bench (2x10-12), Crossbody Single Arm Seated Row (2x8-10), Leg Press Quad Focus (2x8-10), Cable Fly Low To High (2x10-12), Heel Elevated Goblet Squats (2x10-15), Reverse Grip Lat Pulldown (2x12-15), Lying Leg Curls (2x10-12), Superset: Dumbbell Incline Curl + Barbell Skull Crusher (2x10-12/12-15), Superset: Decline Bench Oblique Crunch + Toe Touches (2x8/side + 10-12)

All workouts get tempo 2:0:1:0 (core 1:0:1:0) and the drop set instructions in their notes.

**2. Exercises to Create** (ones not already in your library)

- Stomach Vacuum Tutorial
- Pectoralis Chest Stretch
- Upper Trapezius Stretch
- Dumbbell Straight Leg Deadlift
- Wall Leaning Calf Raise
- Heels Elevated Dumbbell Front Squat
- Decline Bench Oblique Crunch

Exercises that already exist will be reused by ID.

**3. Meal Plan Template: "Scott Szeto - Phase 6" (Shared)**

Two day types:

- **Training Days** — Calories: 2346, P: 165g, C: 300g, F: 54g
  - Meal 1 (Pre-Workout): 3 Eggs, 100g 90/10 Ground Beef, 20g Spinach, 100g Strawberries, 2 slice Sourdough Bread
  - Meal 2 (Post-Workout): 130g Salmon, 100g Cucumbers, 240g Sweet Potatoes, 5g EVOO, 100g Cucumbers/Bok Choy
  - Meal 3: 150g Chicken Breast, 320g Rice, 100g Pineapple, 75g Cucumbers, 10g Honey, 10g EVOO
  - Meal 4 (Cream of Goodness): 80g Rice Krispy Cereal, 200g Almond Milk, 20g Honey, 70g Cucumber/Bok Choy, 200g Sweet Potatoes, 150g FF Greek Yogurt, 100g Blueberries, 1 Banana, 30g Protein Powder, 8g PB, 20g Dark Chocolate, 16g PB

- **Rest Days** — Calories: 2174, P: 166g, C: 247g, F: 57g
  - Meal 1: 3 Eggs, 100g 90/10 Ground Beef, 20g Spinach, 100g Strawberries, 2 slice Sourdough Bread
  - Meal 2: 130g Salmon, 100g Cucumbers, 240g Sweet Potatoes, 5g EVOO, 100g Cucumbers/Bok Choy
  - Meal 3: 120g Chicken Breast, 250g Rice, 70g Kimchi, 5g EVOO, 150g FF Greek Yogurt, 10g PB, 100g Mango, 25g Rice Krispy Cereal, 10g Honey
  - Meal 4: Cream of Goodness (same as training day)

**4. Supplements to Add to Catalog** (missing ones)

- Caffeine (200mg)
- Betaine HCL (500-750mg)
- Boron (3mg)
- Zinc + Copper (25mg/1mg)
- Ashwagandha KSM-66 (600mg)
- Methylfolate L-5-MTHF (1000mcg)
- Methylcobalamin (2000mcg)

**5. Supplement Plan: "Scott Szeto Stack" (Shared)**

Using existing + new catalog items with correct timings:
- Multivitamin (Triumph) — 3 pills, with Meal 1
- Vitamin D3 + K2 — 4000 IU, with Meal 1
- Fish Oils — 3000mg, with Meal 1
- Boron — 3mg, with Meal 1
- Methylfolate — 1000mcg, with Meal 1
- Methylcobalamin — 2000mcg, with Meal 1
- Iodine — 1 drop, fasted
- Psyllium Husk — 1 tsp, fasted
- Probiotics (25B) — fasted
- Caffeine/Pre-Workout — pre-workout
- Creatine Monohydrate — 5g, post-workout
- Protein Powder — as needed
- Glutamine — 5g, post-workout (optional)
- Betaine HCL — 500mg, with Meal 2 & 3
- Zinc + Copper — 25mg/1mg, with Meal 2
- Ashwagandha KSM-66 — 600mg, before bed
- Magnesium Bisglycinate — 700mg total (1 pill post-workout + 2 pills before bed)

### Technical Approach

A single script will:
1. Create missing exercises in the `exercises` table
2. Create 4 workouts in `workouts` + `workout_exercises` + `workout_sets`
3. Create the program in `programs` + `program_phases` + `program_workouts` with `is_master = true`
4. Create missing supplements in `master_supplements`
5. Create the supplement plan in `supplement_plans` + `supplement_plan_items` with `is_master = true`
6. Create the meal plan template in `meal_plans` (is_template = true) + `meal_plan_days` + `meal_plan_items`

All items will be owned by your coach ID and marked as shared (`is_master = true`).

