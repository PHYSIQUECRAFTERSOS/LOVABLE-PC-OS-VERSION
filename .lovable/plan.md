

# Add Trainerize-Style Program Progress Bar to Client Cards

## What We're Building
Replace the small text-only phase indicator ("40d left · Apr 26") with a prominent, color-coded progress bar showing program completion percentage, phase name, end date, and days remaining — similar to how Trainerize displays program progress inline on each client row.

## Design
Each client card will show a full-width progress bar below the client name/compliance row:

```text
┌─────────────────────────────────────────┐
│ ☑ [Avatar] Client Name                  │
│           62% compliance ⚡3d            │
│   ┌─────────────────────────────────┐   │
│   │ phase 1 · Ends Apr 26 · 40d    │   │
│   │ ████████████████░░░░░░░░  65%   │   │
│   └─────────────────────────────────┘   │
│                              Today's Cal│
└─────────────────────────────────────────┘
```

**Color logic** (elapsed % of total program duration):
- **Green** (`emerald-500`): < 70% elapsed (plenty of time)
- **Amber** (`amber-500`): 70–90% elapsed (approaching end)
- **Red** (`destructive`): > 90% elapsed or overdue

## Technical Changes

### 1. Expand `PhaseInfo` interface
Add `totalDays` (total program duration from start to current phase end) so we can compute elapsed percentage:
```ts
interface PhaseInfo {
  phaseName: string;
  endDate: string;
  daysLeft: number;
  totalDays: number; // NEW — total duration in days for the current phase span
}
```

### 2. Update `fetchPhases` computation (lines ~244-251)
After computing `endDate` and `daysLeft`, also compute `totalDays`:
```ts
const totalDays = differenceInDays(endDate, new Date(a.start_date));
```
Store it in the map.

### 3. Replace inline phase text with a progress bar component (lines ~411-419)
Move the phase display out of the inline `flex-wrap` row and into its own full-width row below the name. Render:
- A label row: `{phaseName} · Ends {endDate} · {daysLeft}d left` (or "Overdue")
- A styled `<Progress />` bar (from `src/components/ui/progress.tsx`) with dynamic color via inline `--progress-color` CSS variable
- Percentage text on the right

### File: `src/components/clients/SelectableClientCards.tsx`
- Add `totalDays` to `PhaseInfo`
- Compute `totalDays` in `fetchPhases`
- Import `Progress` from `@/components/ui/progress`
- Replace the `{phase && ...}` text span with a new block below the name row containing the progress bar
- Compute `elapsedPct = Math.min(100, Math.round(((totalDays - daysLeft) / totalDays) * 100))` for the bar value
- Apply color: green < 70%, amber 70-90%, red > 90%/overdue

No other files need changes.
