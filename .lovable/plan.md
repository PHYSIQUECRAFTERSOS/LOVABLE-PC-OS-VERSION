

## Plan: Workout Preview, Inline Phase Rename, and New/Import Buttons in Client Training Tab

### Problem
1. Clicking a workout in the client's Training tab only opens the editor — no way to preview exercises without editing
2. Phase names require clicking a small edit icon to rename — not as fast as clicking the name directly (like Trainerize)
3. No "New" or "Import" buttons to create workouts or import from master/other clients within a phase

### Changes — Single File: `src/components/clients/workspace/TrainingTab.tsx`

**1. Workout Preview on Click**
- Import `WorkoutPreviewModal` from `@/components/training/WorkoutPreviewModal`
- Add state: `previewWorkoutId`, `previewWorkoutName`
- Make the workout card's main area (name + day badge) clickable → opens `WorkoutPreviewModal`
- The edit pencil icon stays as a separate action on hover
- The "Start Workout" button in the preview modal will be hidden for coach role (coaches preview, not start)

**2. Inline Phase Rename on Click**
- Make the phase name (`<h4>`) directly clickable to enter edit mode (click stops propagation so it doesn't toggle collapse)
- Remove the separate Edit2 icon button since clicking the name does the same thing
- On blur or Enter → save via existing `renamePhase()`

**3. New + Import Buttons per Phase**
- Add a toolbar row inside each expanded phase with "New" and "Import" buttons
- **New**: Opens the existing `WorkoutBuilderModal` (already used in ProgramDetailView) to create a workout, then inserts a `program_workouts` row linking it to the phase
- **Import**: Opens a dropdown/dialog with two options:
  - "From Master Library" — fetches coach's template workouts, lets them pick one, clones it into the client's program
  - "From Client's Program" — opens a searchable client select, loads that client's program workouts, lets them pick and clone

**4. Import Implementation**
- Add state for import dialog: `importOpen`, `importPhaseId`, `importSource` ("master" | "client")
- For master import: query `workouts` where `coach_id = user.id` and `is_template = true`
- For client import: use `SearchableClientSelect` to pick a client, then load their program workouts
- Clone logic reuses the existing `cloneWorkout` pattern already in `handleAssignProgram`

### Technical Details
- Import `WorkoutPreviewModal` and `WorkoutBuilderModal` components
- Import `SearchableClientSelect` for client picker in import flow
- The `WorkoutPreviewModal` already exists and works perfectly — just need to wire it up
- `WorkoutBuilderModal` already handles creating workouts and returning the ID via `onSave(workoutId, name)`
- After creating/importing, insert into `program_workouts` with the target `phase_id` and reload

