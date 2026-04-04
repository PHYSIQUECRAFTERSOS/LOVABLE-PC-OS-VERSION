

## Auto-Save System for Training Builders

### Problem
When coaches build programs or edit workouts, navigating away (tapping Messages, switching tabs, etc.) loses all unsaved work. The `WorkoutBuilderModal` (desktop) already has robust autosave — but `ProgramBuilder`, `ProgramDetailView` phase settings, and `MobileWorkoutEditor` do not.

### Current State

| Component | Autosave? | Draft persistence? |
|---|---|---|
| WorkoutBuilderModal (desktop) | Yes — 1200ms debounce to DB | Yes — sessionStorage |
| ProgramBuilder (create new) | No | No |
| ProgramDetailView (edit existing) | Partial — individual ops save immediately, but phase settings don't | No |
| MobileWorkoutEditor | No | No |

### What Gets Built

**1. ProgramBuilder — sessionStorage draft + autosave for edits**

This is the biggest pain point (Aaron's complaint). Two modes:

- **Creating new program**: Save a sessionStorage draft on every change (debounced 500ms). When coach returns to the builder, restore the draft. Show a "Resume draft?" prompt if a draft exists. Also flush draft on `visibilitychange` / `pagehide`.
- **Editing existing program** (`editProgramId` set): Add DB autosave (debounced 2000ms) using the same pattern as `WorkoutBuilderModal` — snapshot comparison, skip if unchanged, queue if in-flight. Show "Saving..." / "Saved" indicator in header.

**2. MobileWorkoutEditor — autosave to DB**

Since the mobile editor always edits an existing workout (`workoutId` is required), add DB autosave with the same 1200ms debounce pattern from `WorkoutBuilderModal`:
- Build snapshot of current state
- Compare to last persisted snapshot
- If different, persist to DB (update workout name/instructions, delete+reinsert exercises)
- Show autosave status indicator ("Saving..." / "Saved ✓")
- On close/nav-away, flush any pending changes
- Listen to `visibilitychange` for iOS app-switch saves

**3. ProgramDetailView — autosave phase settings**

Phase metadata (name, training style, intensity system, progression rule, description) currently requires a manual save. Add:
- Debounced (1500ms) auto-persist of phase settings when changed via `updatePhase()`
- Each phase with an `id` gets its settings written to DB automatically
- Show per-phase "Saved ✓" indicator briefly

### Files to Modify

- `src/components/training/ProgramBuilder.tsx` — Add sessionStorage draft system + DB autosave for edit mode
- `src/components/training/MobileWorkoutEditor.tsx` — Add DB autosave (mirror WorkoutBuilderModal pattern)
- `src/components/training/ProgramDetailView.tsx` — Add debounced phase settings auto-persist

### Files NOT Modified
- `WorkoutBuilderModal.tsx` — already has robust autosave
- `ClientWorkoutEditorModal.tsx` — desktop only, already saves on close

### Technical Approach

All three components follow the same proven pattern from `WorkoutBuilderModal`:

```text
State change → debounce timer (1200-2000ms) → snapshot comparison
  → if changed: persist to DB + update lastPersistedSnapshot
  → if in-flight: queue next save
  → on visibilitychange="hidden": flush immediately
  → on unmount: flush to sessionStorage (new programs) or DB (existing)
```

The autosave indicator uses a shared pattern: `"idle" | "saving" | "saved" | "error"` with "saved" auto-clearing after 1.8s.

### Improvements to Consider

1. **Conflict detection**: If two coaches edit the same program simultaneously, the last save wins. A future improvement could add `updated_at` comparison before saving.
2. **Undo support**: With autosave, accidental deletions are harder to recover. Could add a brief "Undo" toast after destructive actions (remove exercise, remove phase).
3. **Draft expiry**: sessionStorage drafts for new programs should include a timestamp and expire after 24 hours to avoid stale resurrections.
4. **Network-aware saving**: Skip autosave attempts when offline (check `navigator.onLine`) and queue for when connection returns.

