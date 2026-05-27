## Improve Check-In History Readability

The questions render as `text-xs text-muted-foreground` (tiny + faded) and answers as `text-sm` on a barely-visible `bg-muted/30`. In dark mode the muted gray on near-black background fails contrast and forces squinting.

### Changes — `src/components/checkin/ClientCheckinHistory.tsx` (lines ~325-335)

**Question label** (`{idx + 1}. {question_text}`)
- `text-xs text-muted-foreground` → `text-sm font-semibold text-primary` (gold)
- Add `tracking-wide` and a small uppercase number badge for fast scanning, e.g. `Q1` chip + question text on the same row
- Slightly wider gap between Q blocks: `space-y-3` → `space-y-4`

**Answer block** (the paragraph below each question)
- `text-sm text-foreground bg-muted/30 p-2 rounded` → `text-[15px] leading-relaxed text-foreground bg-card border border-border/60 p-3 rounded-md`
- Add `whitespace-pre-wrap` so paragraph breaks render
- Add a subtle gold left border (`border-l-2 border-l-primary/50`) so each answer reads as a quoted response

**Container spacing**
- Bump per-question vertical rhythm so the gold question stands clearly above the answer card

### Out of scope
- No changes to query, data shape, status badges, summary cards (Compliance / Stress / Weight), submission form, or coach note logic
- No changes to other check-in components (review dashboard, submission form, form builder)
- Mobile spacing remains unchanged beyond the font-size bump
