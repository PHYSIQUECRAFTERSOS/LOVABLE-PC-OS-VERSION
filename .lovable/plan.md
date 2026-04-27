## Goal

Make the client calendar (`/clients/:id` → Calendar tab) easier to read on desktop, matching the Trainerize lettering weight/size from your reference screenshot. Mobile stays untouched (you confirmed it already looks great). **Zero function changes** — visual edits only.

## Scope

Single file: `src/components/clients/workspace/CalendarTab.tsx`

No other components, no routing, no data, no RLS.

## Changes (all gated to `md:` breakpoint so mobile is unaffected)

### 1. Event labels in day cells (line 821) — the main readability win
- **Before:** `text-[9px] truncate leading-tight`
- **After:** `text-[9px] md:text-xs md:font-medium truncate leading-tight`
- Effect: 9px → 12px medium-weight on desktop. Matches the Trainerize "Day 1: Upper & Core" / "Stair Climbing — Stairmaster…" / "13 Foods Added" boldness in your screenshot.

### 2. Status dots next to event labels (lines 815–819)
- Bump from `h-2.5 w-2.5` → `md:h-3 md:w-3` so the dot scales proportionally with the larger text. Trend arrows (lines 792–794) bump from `h-2.5 w-2.5` → `md:h-3 md:w-3` for the same reason.

### 3. "+N more" overflow link (line 829)
- **Before:** `text-[9px] text-primary font-medium pl-3`
- **After:** `text-[9px] md:text-xs text-primary font-medium md:font-semibold pl-3`

### 4. Legend labels in left sidebar (lines 714, 716, 729, 860)
- "Completed in [Month]" labels (line 714) and counts (line 716): bump from `text-xs` → `md:text-sm md:font-medium` on desktop.
- Legend items (line 729): bump from `text-[10px]` → `md:text-xs md:font-medium`.
- Section card titles "Completed in April" / "Legend" (lines 705, 723): bump from `text-xs` → `md:text-sm`.

### 5. Weekday headers Mon/Tue/Wed/… (line 756)
- **Before:** `text-center text-xs font-medium text-muted-foreground py-1.5`
- **After:** `text-center text-xs md:text-sm font-medium md:font-semibold text-muted-foreground py-1.5 md:py-2`

### 6. Day-number badge in each cell (line 770)
- **Before:** `text-xs font-medium mb-0.5 w-5 h-5`
- **After:** `text-xs md:text-sm font-medium md:font-semibold mb-0.5 w-5 h-5 md:w-6 md:h-6`
- The slightly larger circle on desktop keeps the day number from looking cramped next to the bigger event labels.

### 7. Today highlight — bonus left-border accent (line 769)
- **Before:** `… ${today ? "ring-1 ring-inset ring-primary/50" : ""}`
- **After:** `… ${today ? "ring-1 ring-inset ring-primary/50 md:border-l-2 md:border-l-primary" : ""}`
- Adds a 2px gold (`primary` = #D4A017) left border on today's cell on desktop only. Mobile keeps the existing ring-only treatment. Pure visual scanning aid.

### 8. Cell min-height bump (line 769)
- **Before:** `min-h-[90px] md:min-h-[110px]`
- **After:** `min-h-[90px] md:min-h-[130px]`
- The bigger 12px event text needs ~20px more vertical room per cell to fit 3 events comfortably without cramping. Mobile (`90px`) is unchanged.

## What is NOT changing

- Mobile rendering (everything below `md:` breakpoint stays byte-for-byte identical).
- Click handlers, drag-and-drop, event fetching, day click, schedule dialog, weight history, modal logic.
- The `+N more` threshold (still 3 events visible per day before overflow).
- Color palette — gold #D4A017 stays as-is; status dot colors unchanged.
- Sidebar nav, header bar, tab bar, mobile coach view.
- Any other tab in the client workspace (Dash, Training, Nutrition, Meal Plan, etc.).

## Acceptance check (after I switch to default mode and apply)

1. Open `/clients/:id` → Calendar tab on desktop (≥1024px). Event labels read clearly without squinting; "Day 1: Upper & Core" looks comparable in weight to the Trainerize screenshot.
2. Today's column shows a thin gold left border in addition to the existing ring.
3. Resize the browser to 375px (mobile width). Calendar looks identical to current mobile.
4. No event handlers regressed: clicking an event still opens the detail modal; clicking an empty day still opens the schedule dialog; "+N more" still expands the day list.
5. No TypeScript or build errors.

## Out of scope (flagged for future)

- Trainerize-style full left-band per day (full-height colored stripe across the whole row). The today-only accent is a lighter-touch first step.
- Larger overhaul of the Calendar grid in `src/components/calendar/CalendarGrid.tsx` (the client-facing calendar). This prompt is strictly the coach-side `CalendarTab` per your screenshots.
- Build errors visible in the system message (pre-existing edge-function TS errors in `process-email-queue`, `open-food-facts-search`, `usda-food-search`, etc.) — unrelated to the calendar visual work; will not be touched here.
