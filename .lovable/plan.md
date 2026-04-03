

## Add Unit Preferences Toggle for Clients + Coach-Side Conversion

### Overview
Add a Trainerize-style "Units" settings section for clients to toggle between imperial/metric for weight, body measurements, and distance. All data continues to be stored in imperial (lbs, inches, km) in the database. Client-side displays convert on-the-fly based on their preference. Coach-side always displays in imperial (lbs for weight, inches for measurements, km for distance) regardless of client settings.

### Database Change
Add three columns to the `profiles` table:
- `preferred_weight_unit` TEXT DEFAULT 'lbs' — options: 'lbs' or 'kg'
- `preferred_measurement_unit` TEXT DEFAULT 'in' — options: 'in' or 'cm'
- `preferred_distance_unit` TEXT DEFAULT 'miles' — options: 'miles' or 'km'

No new tables needed. Storage format stays imperial — conversions are display-only.

### New Files

**1. `src/hooks/useUnitPreferences.ts`**
- Custom hook that fetches the three unit preferences from `profiles`
- Provides conversion helper functions:
  - `convertWeight(lbs)` → returns value in user's preferred unit
  - `convertMeasurement(inches)` → returns value in user's preferred unit
  - `convertDistance(km)` → returns value in user's preferred unit
  - `parseWeightInput(value)` → converts user input back to lbs for storage
  - `parseMeasurementInput(value)` → converts user input back to inches for storage
  - `parseDistanceInput(value)` → converts user input back to km for storage
  - `weightLabel`, `measurementLabel`, `distanceLabel` — unit suffix strings
- Coach/admin roles always return imperial defaults (no conversion)

**2. `src/components/settings/UnitPreferences.tsx`**
- Trainerize-style settings card with three sections: WEIGHT, DISTANCE, BODY MEASUREMENTS
- Each section shows two radio-style rows with checkmark for active selection (matching the uploaded screenshot)
- Persists to `profiles` table on selection change
- Only shown to clients (not coaches/admins)

### Modified Files

**3. `src/pages/Profile.tsx`**
- Import and render `<UnitPreferences />` after `<NotificationSettings />`
- Only render for client role

**4. `src/pages/BodyStats.tsx`**
- Use `useUnitPreferences` hook
- Display weight input field with dynamic unit label (lbs/kg)
- Display measurement fields with dynamic unit label (in/cm)
- Convert input values back to imperial before saving to `body_stats`

**5. `src/components/workout/ExerciseCard.tsx`**
- Use `useUnitPreferences` hook
- Show "lbs" or "kg" column header based on preference
- Convert weight display values from stored lbs → client unit
- Convert input back to lbs before passing to parent
- PR display uses client's unit

**6. `src/components/workout/WorkoutSummary.tsx`**
- Convert total volume and PR weights to client's unit
- Update "lbs Volume" label dynamically

**7. `src/components/dashboard/WeightHistoryScreen.tsx`**
- Initialize unit toggle from user's preference instead of hardcoded "lbs"
- Keep existing toggle so users can temporarily switch

**8. `src/components/dashboard/DistanceTrendModal.tsx`**
- Use `useUnitPreferences` for distance display
- Convert km values to miles if client prefers miles
- Update tooltip and axis labels

**9. `src/components/dashboard/ProgressWidgetGrid.tsx`**
- Convert distance display to client's preferred unit

**10. `src/components/biofeedback/MeasurementsForm.tsx`**
- Use `useUnitPreferences` for measurement labels (in/cm)
- Convert input back to inches/original units before saving

**11. Coach-side files (NO changes needed for unit display)**
- `ClientWorkspaceWeight`, `SummaryTab`, `ProgressTab` — these already display raw DB values which are in imperial. No conversion applied. Coach always sees lbs/inches/km.

### Conversion Constants
- 1 lb = 0.453592 kg
- 1 inch = 2.54 cm
- 1 km = 0.621371 miles

### Key Design Decisions
- **Storage stays imperial** — no migration of existing data. All conversions are display-layer only.
- **Coach always sees imperial** — the hook returns no-op conversions for coach/admin roles
- **Onboarding unchanged** — keeps existing feet/inches/lbs flow as requested
- **Distance stored as km** (from HealthKit) — converted to miles for display if preferred

### Improvements
- Unit preference persists across sessions (stored in profiles)
- Consistent unit display across all screens (workout, body stats, weight history, distance)
- Coach never has to guess units — always sees standardized imperial values

