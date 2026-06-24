## Goal
Make coach-side screens instantly scannable. Kill the washed-out grays on labels and values that you actually need to read (compliance %, phase names, "No active phase", "7d inactive", section headers like CURRENT PHASE / NEXT PHASE). Keep the matte-black + gold aesthetic — no layout shifts, no client-side changes.

## Scope
Coach + admin views only. Client-side mobile UI is untouched.

Files in scope:
- `src/components/clients/SelectableClientCards.tsx` — the Clients roster cards in your first screenshot
- `src/components/dashboard/CoachCommandCenter.tsx` — At-Risk list, Training Phase Deadlines, KPI tiles, section subtext
- `src/components/dashboard/ClientCards.tsx` — secondary coach client card variant
- `src/components/clients/workspace/SummaryTab.tsx` and `EngagementTab.tsx` — client workspace micro-text
- `src/components/clients/ClientPreviewDialog.tsx` — preview dialog labels
- `src/components/dashboard/ComplianceScore.tsx` — shared compliance badge subtext
- Page headers on `/clients`, `/team`, `/libraries`, `/admin` where subtitle uses `text-muted-foreground` at small sizes

Out of scope: client dashboard, workout logger, nutrition tracker, calendar event cards on the client side, onboarding, any layout/spacing changes.

## What changes (rules, not one-off tweaks)

1. **Section labels** (`CURRENT PHASE`, `NEXT PHASE`, `CLIENT`, `TODAY'S CALS`, `TOOLS`, etc.)
   - Before: `text-[9px] uppercase tracking-wider text-muted-foreground/70`
   - After: `text-[11px] uppercase tracking-[0.12em] font-semibold text-foreground/70`
   - Result: same visual role (a label), but readable at arm's length.

2. **Primary card body text** (phase name + end date, "No active phase", "No next phase queued", "0% compliance", "7d inactive", "3+ missed workouts")
   - Before: `text-[10px] text-muted-foreground` or `text-xs text-muted-foreground`
   - After: `text-xs text-foreground/85 font-medium` (and `font-semibold` for the values you scan first — compliance %, days-left, phase name)
   - "No active phase" / "No next phase queued" become `text-foreground/70` instead of `/50`-feeling muted — visible without being loud.

3. **Numeric values that drive decisions** (compliance %, days left, "Phase 1 · Ends Jul 20")
   - Bumped to `font-semibold` with full `text-foreground` (or the existing semantic color: destructive / warn / success). Tabular-nums already on.

4. **At-Risk row subtext** ("7d inactive 7d inactive", "Missed check-in")
   - Raised from `text-muted-foreground` to `text-foreground/80`, and the duplicated `"7d inactive 7d inactive"` bug gets deduped while I'm in there.

5. **Page subtitles** ("Manage your client roster, invites, and progress.", "Showing 0 overdue and 0 due within 7 days…")
   - Raised to `text-foreground/75` so they read at a glance instead of fading into the card edges.

6. **Sweep rule**: any coach-side occurrence of `text-muted-foreground/50`, `/60`, `/70` on text that conveys information (not pure decoration) gets lifted to `text-foreground/80` or `text-muted-foreground` (no opacity). Pure decoration (dividers, placeholder dashes) stays as-is.

## What does NOT change
- No new colors. No token edits in `index.css` / `tailwind.config.ts`.
- No layout, spacing, card structure, icon, or copy changes beyond the duplicated-label dedupe above.
- Gold accent usage stays where it is.
- Client-side files untouched.

## Verification
After the edits I'll re-check `/clients` and `/dashboard` (coach view) at 1280px and at mobile width to confirm:
- CURRENT PHASE / NEXT PHASE labels are readable without leaning in
- "0% compliance", "No active phase", "No next phase queued" no longer disappear into the background
- At-Risk list reads cleanly
- No layout shift, no broken truncation