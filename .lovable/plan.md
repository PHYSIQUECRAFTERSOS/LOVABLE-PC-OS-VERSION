

# Adjustable Check-In Dashboard Days + Custom Form Builder

## What We're Building

### Feature 1: Configurable Submission Day Columns (per coach)

Currently the dashboard hardcodes "Submitted Wednesday" and "Submitted Thursday" columns. We'll make each coach able to define flexible day buckets (1-4 columns), each with a custom label and day-of-week range.

**Database**: New `coach_checkin_day_config` table:
- `id`, `coach_id`, `label` (text, e.g. "Friday"), `day_of_week` (int, 0=Sun - 6=Sat), `sort_order`, `color_class` (optional, for border styling)
- Default rows seeded for existing coaches: Wednesday (day 3) and Thursday (day 4)
- RLS: coaches manage their own rows

**Settings UI**: Add a "Submission Days" section inside the existing `ReviewerSettingsDialog` (gear icon). Coaches can:
- Add/remove day columns (max 4)
- Pick a day of week + label for each
- Reorder them

**Dashboard Logic** (`CheckinSubmissionDashboard.tsx`):
- Fetch `coach_checkin_day_config` for the logged-in coach
- If none exist, fall back to the current Wed/Thu defaults
- Replace hardcoded `submittedWednesday`/`submittedThursday` with a dynamic array of buckets based on the coach's config
- Submissions are sorted into buckets by matching the submission's PST day-of-week to the configured day. Submissions on earlier days go to the first matching bucket; later days to later buckets. "Not Submitted" remains the catch-all.
- Column titles, icons, and colors are driven by the config

### Feature 2: Enhanced Form Builder (New Standalone)

A new standalone form builder page/section with Google Forms-style question types.

**Question Types** (expanding existing `QUESTION_TYPES`):
- Short answer (text, single line)
- Paragraph (text, multi-line)
- Multiple choice (radio, single select)
- Checkbox (multi-select)
- Dropdown (select)
- Linear scale (1-5, 1-10, customizable range + labels)
- Rating (star rating, 1-5)
- Numeric entry (number input)

No minimum character requirements. Unlimited questions. Each question has a required/not-required toggle.

**Database changes**:
- Add `question_type` values: `paragraph`, `checkbox`, `rating` to the existing `checkin_questions` table (already stores as text, no schema change needed)
- Add `default_template_id` column to a new `coach_checkin_preferences` table (or reuse the day config table as a broader preferences table)

**Auto-assignment**: Add a `default_template_id` column to a `coach_checkin_preferences` table. When a client submits a check-in:
- Look up their coach via `coach_clients`
- Fetch the coach's `default_template_id` from preferences
- If none set, fall back to the hardcoded `DEFAULT_TEMPLATE_ID`
- The client's `WeeklyCheckinForm` and `CheckinSubmissionForm` both use this resolved template

**New Builder Component** (`src/components/checkin/StandaloneFormBuilder.tsx`):
- Full-page form builder accessible from Progress > Forms (for coaches)
- Google Forms-style drag-to-reorder questions
- Live preview panel
- "Set as Default" button to make it the coach's default template
- Edit existing templates (load questions, modify, save)

**Isolation**: Each coach only sees their own templates. Clients only see questions from their coach's default (or assigned) template.

## Files to Create/Modify

1. **Migration**: New `coach_checkin_preferences` table (`coach_id`, `default_template_id`, `submission_day_configs` or separate table), plus `coach_checkin_day_config` table
2. **`src/components/dashboard/ReviewerSettingsDialog.tsx`**: Add "Submission Days" config section
3. **`src/components/dashboard/CheckinSubmissionDashboard.tsx`**: Replace hardcoded Wed/Thu with dynamic day buckets from config
4. **`src/components/checkin/StandaloneFormBuilder.tsx`**: New full-page builder with all question types
5. **`src/components/checkin/WeeklyCheckinForm.tsx`**: Resolve template from coach preferences instead of hardcoded ID
6. **`src/components/checkin/CheckinSubmissionForm.tsx`**: Same template resolution
7. **`src/pages/Progress.tsx`**: Wire up new builder in the Forms tab for coaches

## Technical Details

### Day Config Table Schema
```sql
CREATE TABLE public.coach_checkin_day_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  label text NOT NULL,
  day_of_week integer NOT NULL, -- 0=Sun, 1=Mon...6=Sat
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.coach_checkin_day_config ENABLE ROW LEVEL SECURITY;
```

### Preferences Table Schema
```sql
CREATE TABLE public.coach_checkin_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL UNIQUE,
  default_template_id uuid REFERENCES public.checkin_templates(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.coach_checkin_preferences ENABLE ROW LEVEL SECURITY;
```

### Bucket Assignment Logic
For each submission, find which configured day it falls on or closest-before. Example: if coach has Friday (5) and Saturday (6), a submission on Friday goes to "Friday" bucket, Saturday goes to "Saturday" bucket, Wednesday goes to earliest bucket.

