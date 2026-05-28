## Improve Onboarding Tab Readability

Apply the same readability treatment from `ClientCheckinHistory` to the coach-side Onboarding tab (`src/components/clients/workspace/OnboardingTab.tsx`) so labels and answers pop in dark mode.

### Changes — `OnboardingTab.tsx` Intake Questionnaire section

Replace the current cramped two-column row layout (tiny uppercase label left, faded answer right) with a stacked Q/A pattern matching check-ins:

- **Label** ("PRIMARY GOAL", "GENDER", etc.)
  - From: `text-[10px] font-semibold text-muted-foreground uppercase tracking-wider`
  - To: `text-sm font-semibold text-primary tracking-wide` (gold), paired with a small `bg-primary/15 text-primary` chip showing the field index or a short tag for fast scanning
- **Answer** value
  - From: `text-xs text-foreground text-right`
  - To: `text-[15px] leading-relaxed text-foreground bg-card border border-border/60 border-l-2 border-l-primary/60 p-3 rounded-md whitespace-pre-wrap`
- **Layout**
  - Drop the `flex justify-between` row + `Separator` rhythm
  - Each Q/A becomes a `space-y-2` block, with outer `space-y-5` between blocks (same as check-in history)

### Out of scope
- No changes to data fetching, field mapping, or `questionPairs` logic
- No changes to Signed Agreements card or Starting Progress Photos card
- No changes to the client-facing onboarding form components
