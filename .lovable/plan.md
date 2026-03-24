

# Plan: Fix Ranked Names, Coach-Based Client Filter, Staff Member Management Modal

## Summary

Three features:

1. **Fix "Member" names on leaderboard** — the `profiles.full_name` is empty for some users despite invite data having names. Backfill from `client_invites` and improve the ranked leaderboard name resolution.
2. **Filter clients by coach** — add coach names to the "All Clients" dropdown on the Clients page so owners can view any coach's client roster.
3. **Staff member detail modal** — clicking a coach on the Team page opens a popup with overview, their clients, command center view, and deactivate/delete actions.

---

## Changes

### 1. Fix Ranked "Member" Names

**Root cause**: The `handle_new_user` trigger sets `full_name` from `raw_user_meta_data->>'full_name'` or email prefix. But the invite flow may not pass `full_name` into the signup metadata, so profiles end up with just the email prefix (e.g. "john123") or empty.

**Database migration**: Backfill `profiles.full_name` from `client_invites` where the profile name is missing or is just an email prefix:
```sql
UPDATE profiles p
SET full_name = TRIM(CONCAT(ci.first_name, ' ', ci.last_name))
FROM client_invites ci
WHERE ci.created_client_id = p.user_id
  AND ci.first_name IS NOT NULL
  AND (p.full_name IS NULL OR p.full_name = '' OR p.full_name NOT LIKE '% %');
```

This one-time fix ensures all invited clients have proper names in `profiles`, which the leaderboard already reads.

### 2. Filter Clients by Coach

**File: `src/components/clients/SelectableClientCards.tsx`**

- Add a new prop or internal state for `coachFilter` (default: current user's ID).
- Change the initial `coach_clients` query from `.eq("coach_id", user.id)` to conditionally use the selected coach ID.
- Fetch staff list (coaches/admins) from `user_roles` + `profiles` to populate the dropdown.
- Replace the existing "All Clients / High Compliance / Low Compliance" `<Select>` with a two-dropdown layout:
  - **Coach filter**: "My Clients" (default), each coach name, "All Coaches"
  - **Compliance filter**: keeps existing options

Only admin/owner users see the coach filter dropdown. Regular coaches only see their own clients.

### 3. Staff Member Detail Modal (Owner Only)

**New file: `src/components/team/StaffDetailModal.tsx`**

A dialog that opens when an owner clicks a staff member row on the Team page. Contains:

- **Overview tab**: Avatar, name, role, join date, client count, total active sessions
- **Clients tab**: List of the coach's assigned clients with names and compliance (reuses the same query pattern as `SelectableClientCards`)
- **Actions**: 
  - "Deactivate" button — calls `manage-client-status` edge function with the staff user's ID (same deactivation pattern as clients: sets 100-year ban, updates status)
  - "Delete" button — requires typing "DELETE" to confirm, calls the same edge function with `action: "delete"`
  - Both behind confirmation dialogs

**File: `src/pages/Team.tsx`**

- Add state for `selectedStaffMember` and render `<StaffDetailModal>` when set.
- Make staff rows clickable (only for non-self members, owner-only).
- Add cursor pointer and hover styling to staff rows.

---

## Technical Details

### Coach filter data flow
```text
Owner opens Clients page
  → Fetch all coaches from user_roles + profiles
  → Dropdown: "My Clients" | "Aaron W." | "Kevin W." | "All Coaches"
  → Selection changes coach_id filter on coach_clients query
  → Client cards re-render with filtered results
```

### Staff deactivation flow
```text
Owner clicks coach → StaffDetailModal opens
  → Owner clicks "Deactivate"
  → Confirmation dialog
  → Calls manage-client-status edge function (action: "deactivate", clientId: staffUserId)
  → Staff user banned, coach_clients status updated
  → Refresh team list
```

Note: The existing `manage-client-status` edge function checks `coach_clients` ownership. For staff deactivation, we may need to either:
- Add the staff member as a `coach_clients` entry (not ideal), OR
- Create a lightweight staff-specific deactivation that directly calls `auth.admin.updateUserById` with ban and removes their `user_roles` entry

The cleaner approach is to add a new action in the `staff-invite` edge function (e.g. `action: "deactivate_staff"` and `action: "delete_staff"`) that checks the caller is admin and performs the ban/deletion.

**Edge function update: `supabase/functions/staff-invite/index.ts`**

Add two new actions:
- `deactivate_staff`: Admin-only. Bans the user, removes user_roles entries.
- `delete_staff`: Admin-only. Deletes auth user, removes user_roles + profiles + reassigns/removes coach_clients.

## Files to modify
- Database migration — backfill profiles.full_name from client_invites
- `src/components/clients/SelectableClientCards.tsx` — add coach filter dropdown
- `src/components/team/StaffDetailModal.tsx` — new file, staff overview + clients + deactivate/delete
- `src/pages/Team.tsx` — make staff rows clickable, open StaffDetailModal
- `supabase/functions/staff-invite/index.ts` — add deactivate_staff and delete_staff actions

