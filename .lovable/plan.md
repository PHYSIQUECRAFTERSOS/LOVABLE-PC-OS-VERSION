

## Shared Master Programs in Master Libraries

### What Changes

The `is_master` column already exists on the `programs` table. Currently it's a flag but not used for cross-coach visibility. We'll use it as the "shared" marker — programs with `is_master = true` are visible to ALL coaches/admins on the team, regardless of who created them.

### Database Changes

**New RLS policy on `programs` table:**
- Add a SELECT policy: any authenticated user with `coach` or `admin` role can read programs where `is_master = true AND is_template = true`
- This lets Aaron (or any future coach) see Kevin's shared master programs, and vice versa

```sql
CREATE POLICY "Coaches can view shared master programs"
ON public.programs
FOR SELECT
TO authenticated
USING (
  is_master = true 
  AND is_template = true 
  AND (has_role(auth.uid(), 'coach') OR has_role(auth.uid(), 'admin'))
);
```

### Frontend Changes — `src/pages/MasterLibraries.tsx`

**1. Split programs into Shared vs Personal (like Trainerize screenshot)**

Update `loadPrograms()`:
- Fetch ALL template programs where `coach_id = userId` OR `is_master = true` (the RLS policy handles the rest)
- Separate into two lists: `sharedPrograms` (is_master = true) and `personalPrograms` (is_master = false AND coach_id = userId)

**2. Update the sidebar UI:**
- Add a "Shared" folder section at the top with a count badge (like Trainerize's "Shared 99+")
- Add a "Personal" folder section below with a count badge
- Each section is collapsible
- Programs marked as master show under Shared; others show under Personal
- Show the creator's name on shared programs (fetch profile for coach_id)

**3. Update the "Mark as Master" action:**
- Rename to "Share with Team" / "Make Private" for clarity
- When toggled to shared, the program becomes visible to all coaches
- When toggled to private, only the creator can see it

**4. Permissions for shared programs:**
- Any coach can VIEW and USE (assign to their clients) shared master programs
- Only the CREATOR (or admin) can EDIT or DELETE a shared program
- The three-dot menu conditionally shows Edit/Delete only if `program.coach_id === userId` or user is admin

### File: `src/components/training/ProgramList.tsx`

Same changes mirrored here since ProgramList is used in the Training page's program management — update `loadPrograms()` to also fetch shared master programs with the same Shared/Personal split.

### Files Modified
1. **Database migration** — new RLS SELECT policy for shared master programs
2. **`src/pages/MasterLibraries.tsx`** — split sidebar into Shared/Personal sections, update query, show creator name, conditionally gate edit/delete
3. **`src/components/training/ProgramList.tsx`** — same query update for shared visibility

### Summary
- `is_master = true` = shared with all team coaches
- `is_master = false` = personal template, only visible to creator
- Trainerize-style Shared/Personal folder structure in sidebar
- Any coach can assign shared programs to their clients
- Only creator or admin can edit/delete shared programs

