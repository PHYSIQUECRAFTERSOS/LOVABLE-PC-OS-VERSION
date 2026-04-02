

## Add "Copy to Client" for Individual Phases in Master Libraries

### What This Does
Adds a "Copy to → Client's Program" option in the three-dot menu of each phase in the Program Detail View. When clicked, it opens a dialog (Trainerize-style) where the coach can:
1. Search and select a client from a dropdown
2. Choose scheduling: "Immediately after last scheduled training phase" or "Start on [specific date]"
3. If the client has no existing program/phase, it defaults to starting immediately (today)

### Files to Modify

**`src/components/training/ProgramDetailView.tsx`** — Main changes:

1. **Add state variables** for the copy-to-client dialog:
   - `showCopyToClientDialog`, `copyPhaseIdx`, `copyClients`, `selectedCopyClient`, `copyStartOption` ("after_last" | "specific_date"), `copyStartDate`, `copying`, `copyClientsLoading`

2. **Add `loadCopyClients()` function** — fetches active coach clients with profile names (same pattern as `MasterLibraries.loadClients()`)

3. **Add `openCopyToClientDialog(phaseIdx)` function** — sets the phase index and loads clients

4. **Add `handleCopyPhaseToClient()` function** — the core logic:
   - Determines start date: if "after_last", queries `client_program_assignments` for the client's latest active program end date (start_date + duration_weeks), else uses the manually selected date. If no existing program, defaults to today.
   - Creates a new `programs` row for the client (named after the phase, e.g., "Phase 3 — [Program Name]")
   - Copies the single phase as a `program_phases` row
   - Clones all `program_workouts` → `workouts` → `workout_exercises` for that phase (same pattern as `MasterLibraries.assignToClient`)
   - Marks any existing active `client_program_assignments` as completed
   - Creates a new `client_program_assignments` row with the start date

5. **Add "Copy to Client" menu item** in the phase three-dot `DropdownMenu` (line ~962), between "Duplicate" and the separator before "Delete":
   ```
   <DropdownMenuItem onClick={() => openCopyToClientDialog(phaseIdx)}>
     <Users className="h-3.5 w-3.5 mr-2" /> Copy to Client
   </DropdownMenuItem>
   ```

6. **Add the Copy to Client Dialog** — renders after the existing dialogs:
   - Uses `SearchableClientSelect` for client selection (searchable dropdown)
   - Two radio options: "Immediately after last scheduled training phase" and "Start on [date picker]"
   - Copy button with loading state
   - Import `SearchableClientSelect` from `@/components/ui/searchable-client-select`
   - Import `RadioGroup, RadioGroupItem` from `@/components/ui/radio-group`
   - Import `Users` icon from lucide-react (already partially imported)

### Technical Details
- Reuses the proven clone pattern from `MasterLibraries.assignToClient` (lines 244-323) but scoped to a single phase
- "After last" scheduling: queries `client_program_assignments` where `status = 'active'` for the selected client, computes end date as `start_date + duration_weeks * 7 days`. If none found, uses today
- The new program created for the client will have `is_template: false`, `is_master: false`
- Each workout in the phase gets deep-cloned (workout + exercises) so the client has independent copies

