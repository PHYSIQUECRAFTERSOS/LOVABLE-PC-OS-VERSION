# Fix "Finished Review" Section + Client Assignments Display

## Issue 1: Reviewed clients should move to a "Finished Check-In Review" section

Currently, when you tick off a client (mark as reviewed), they stay in their submission column with reduced opacity and strikethrough. The "Reviews Completed" section at the bottom exists but just shows a progress bar with an expandable list.

**Fix**: When a client is marked as reviewed, remove them from the submission day column and move them into a dedicated "Finished Check-In Review" card. This gives a clear visual of completed reviews vs. still-pending.

**Changes to `CheckinSubmissionDashboard.tsx**`:

- Filter reviewed clients OUT of the submission columns (only show unreviewed clients in Wed/Thu/etc columns)
- Rename the bottom "Reviews Completed" section to "Finished Check-In Review"
- Make it always visible (not collapsed) showing all reviewed clients with their reviewer color tags
- Keep the progress bar showing X/Y completed
- Each reviewed client still clickable to navigate to their check-in tab
- Include an "undo" checkbox so you can unmark a review if needed

## Issue 2: Client names not showing in Reviewer Settings assignments

The `ReviewerSettingsDialog` fetches clients via `coach_clients` filtered by `coach_id = user.id`. The issue is likely that the logged-in user's coach assignments aren't matching. Looking at the code, it queries `coach_clients.eq("coach_id", user!.id)` — if the admin/owner isn't the direct coach for all clients, no results appear.

**Fix in `ReviewerSettingsDialog.tsx**`:

- For admin users, fetch ALL active clients across all coaches (not just `coach_id = user.id`)Have a filter for showing my clients ( Kevin ) and Aaron ( other coaches clients)  so I can easily navigate and not mix up clients because this one area should show all the clients I have because I am the only active coach with clients on this app currrently 
- For coach users, keep the current filter
  &nbsp;
- Add a fallback: if the `coach_clients` query returns empty, also check if the user has admin role and fetch all clients

## Files to modify:

1. `**src/components/dashboard/CheckinSubmissionDashboard.tsx**` — Filter reviewed clients out of columns, enhance the "Finished" section
2. `**src/components/dashboard/ReviewerSettingsDialog.tsx**` — Fix client query for admins to show all clients