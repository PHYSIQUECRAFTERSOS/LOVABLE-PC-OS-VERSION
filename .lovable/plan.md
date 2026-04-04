
Plan to restore login + workout functionality safely:

1. Confirmed root causes
- Auth/session restore has regressed in `src/hooks/useAuth.tsx`:
  - roles are cached only in `sessionStorage`, so cold app relaunches lose the cache
  - role fetch has an aggressive 3s timeout
  - failed/slow role fetch triggers `auto-accept` invite logic for normal users, which can keep `ProtectedRoute` stuck until the 8s stall screen appears
- Workout access is only partially fixed:
  - the last database change covered `workouts` + `workout_exercises`
  - but program-assigned clients still depend on `programs`, `program_phases`, `program_weeks`, and `program_workouts`
  - Zane’s active assignment points to a program where `programs.client_id` is null, so the older policies still block parts of the training flow
- `src/pages/Training.tsx` has an admin regression:
  - it checks `role === "coach"` instead of treating admin like coach, so admins fall into the wrong training path
- There are duplicate workout sessions in the database, so I also need to harden the start/resume flow to avoid duplicate inserts after tapping Start/Resume

2. Code changes
- `src/hooks/useAuth.tsx`
  - move role cache to persistent storage
  - stop treating slow role fetches like missing roles
  - only run invite auto-accept when it is actually relevant
  - preserve last-known role during background refresh so cold launches do not dead-end
- `src/components/ProtectedRoute.tsx`
  - make the loading/failure path resilient to temporary role fetch slowness
  - avoid dropping users into the restore error screen when a valid session already exists
- `src/pages/Training.tsx`
  - treat `admin` the same as `coach`
  - make training queries and tabs use a shared coach/admin path
- workout start flow
  - inspect/fix `WorkoutLogger`, `useActiveSession`, `WorkoutStartPopup`, and related start/resume paths so one tap creates/resumes one session only

3. Backend fix
- Add an additive migration that creates/uses a secure helper for “client assigned to program”
- Add SELECT policies for:
  - `programs`
  - `program_phases`
  - `program_weeks`
  - `program_workouts`
- Keep `workouts` / `workout_exercises` aligned with the same assignment rule
- This will let clients access coach-owned template programs delivered through assignments without weakening security

4. Testing I will perform after implementation
- Client cold relaunch/login: Kevin (Client)
- Program-assigned client: Zane
- Existing working client: Scott
- Coach/admin access: Kevin Wu
- Verify each can:
  - sign in and reopen the app without the restore-session failure
  - load dashboard
  - load training page
  - open workout preview with exercises visible
  - start/resume exactly one workout session
