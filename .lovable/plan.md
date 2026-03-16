# Check-In Review Tracker: Replace Google Sheet

## What We're Building

A reviewer assignment and completion tracking system integrated into the existing Weekly Check-In Dashboard on the Command Center. This replaces the Google Sheet workflow entirely.

### Core Features

1. **Reviewer Management** — A small settings panel to create reviewers (you, Nicko, future staff) with custom names and colors
2. **Client-Reviewer Assignment** — One-time tag per client linking them to a reviewer( make sure this only viewable as a coach log in side and not the client log in side)
3. **Review Completion** — Tap-to-mark a check-in as "reviewed" with strikethrough in place + a completed count section
4. **Color Coding** — Each client row shows their assigned reviewer's color as a left-border or badge( make sure this only viewable as a coach log in side and not the client log in side)

## Database Changes

### New table: `checkin_reviewers`


| Column     | Type        | Notes                                                |
| ---------- | ----------- | ---------------------------------------------------- |
| id         | uuid PK     | &nbsp;                                               |
| coach_id   | uuid        | FK to auth.users, the coach who owns these reviewers |
| name       | text        | "Me", "Nicko", etc.                                  |
| color      | text        | hex color, e.g. "#FBBF24" (yellow), "#06B6D4" (cyan) |
| sort_order | int         | display ordering                                     |
| created_at | timestamptz | &nbsp;                                               |


### New table: `client_reviewer_assignments`


| Column      | Type        | Notes                                   |
| ----------- | ----------- | --------------------------------------- |
| id          | uuid PK     | &nbsp;                                  |
| client_id   | uuid        | FK to auth.users                        |
| reviewer_id | uuid        | FK to checkin_reviewers                 |
| coach_id    | uuid        | FK to auth.users (denormalized for RLS) |
| created_at  | timestamptz | &nbsp;                                  |
| UNIQUE      | (client_id) | one reviewer per client                 |


### Alter `checkin_submissions`

- Add column: `reviewed_by` (uuid, nullable, FK to `checkin_reviewers`)

RLS: Coach can read/write their own reviewers and assignments. Standard coach-client access patterns.

## UI Changes

### File: `src/components/dashboard/CheckinSubmissionDashboard.tsx`

**Enhanced client rows:**

- Left color stripe on each row matching their assigned reviewer's color( make sure this only viewable as a coach log in side and not the client log in side)
- Small reviewer name badge (e.g., "Nicko" in cyan, "Me" in yellow)( make sure this only viewable as a coach log in side and not the client log in side)
- **Checkbox** on each submitted client row — tap to mark as "review complete"
- When checked: name gets `line-through` + `opacity-60`, stays in its column
- Counter in each column header: "3/5 reviewed"

**New "Completed" summary bar** below the 3-column grid:

- Shows count of completed reviews with a progress ring
- Collapsible list of all reviewed clients this week

**Reviewer Settings button** (gear icon in header):

- Opens a small dialog to add/edit/remove reviewers with name + color picker
- Shows current client assignments with ability to reassign

### File: `src/components/dashboard/ReviewerSettingsDialog.tsx` (new)

- List of reviewers with color swatches
- Add reviewer form (name + color)
- Client assignment section: dropdown per client or drag-to-assign

### File: `src/components/dashboard/ClientReviewerAssignment.tsx` (new)

- Used in client workspace or as part of settings dialog
- Simple select dropdown to assign a reviewer to a client

## Data Flow

```text
Coach opens Command Center
  → Dashboard fetches checkin data + reviewer assignments + reviewer profiles
  → Each client row shows reviewer color + name badge
  → Submitted clients show a checkbox
  → Coach taps checkbox → optimistic strikethrough
    → UPDATE checkin_submissions SET reviewed_at=now(), reviewed_by=reviewer_id
  → Completed count updates in header + bottom summary
  → Reviewer Settings (gear icon) → manage reviewers + assign clients
```

## Files Changed


| File                                                      | Change                                                                                                       |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Migration                                                 | Create `checkin_reviewers`, `client_reviewer_assignments` tables; add `reviewed_by` to `checkin_submissions` |
| `src/components/dashboard/CheckinSubmissionDashboard.tsx` | Add reviewer colors, checkboxes, strikethrough, completed section                                            |
| `src/components/dashboard/ReviewerSettingsDialog.tsx`     | New — reviewer CRUD + client assignment UI                                                                   |
