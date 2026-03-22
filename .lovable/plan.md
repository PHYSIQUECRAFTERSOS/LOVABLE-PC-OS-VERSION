# Plan: Trainerize-Style Team Page with Client Assignment

## What Changes

### 1. Team Page — Show all roles properly

**File: `src/pages/Team.tsx**`

- Add "manager" to the role query filter (currently only queries `admin` and `coach`)
- Add role labels/colors for "manager" alongside existing admin/coach. Make sure that when my coaches log in they can see all other coaches/ and team members including the owner/manger (me) currently when my coach aaron on my team logs in he does not see my name
- Update `rolePriority` to include manager (between admin and coach) 

### 2. Team Page — Add "Add Client" button with coach assignment

**File: `src/pages/Team.tsx**`

- Add an "Add Client" button next to the existing "Invite Coach" button in the header
- Open a new `AddClientWithAssignmentDialog` that includes all existing AddClientDialog fields plus an "Assign To" dropdown listing all staff members (coaches, admins, managers)

### 3. New Component: AddClientWithAssignmentDialog

**New file: `src/components/clients/AddClientWithAssignmentDialog.tsx**`

- Clone the existing `AddClientDialog` logic but add an "Assign To" `<Select>` dropdown
- On mount, fetch all staff (admin/coach/manager roles) from `user_roles` + `profiles`
- Default selection: the current logged-in user
- Pass the selected `assigned_coach_id` to the edge function instead of relying on `user.id`

### 4. Edge Function Update: Accept `assigned_coach_id`

**File: `supabase/functions/send-client-invite/index.ts**`

- Accept an optional `assigned_coach_id` from the request body
- If provided (and the caller is a valid coach/admin/manager), use it instead of `user.id` for the `assigned_coach_id` field in the invite record
- If not provided, fall back to `user.id` (backward compatible)

---

## Technical Details

**Edge function change** (line 108 of `send-client-invite/index.ts`):

```typescript
// Before:
assigned_coach_id: user.id,

// After:
assigned_coach_id: body.assigned_coach_id || user.id,
```

**Staff fetch for the "Assign To" dropdown** uses the same pattern as Team.tsx:

1. Query `user_roles` for `admin`, `coach`, `manager` roles
2. Fetch matching `profiles` for display names
3. Render as `<Select>` options

**Role labels map update**:

```typescript
const roleLabels = { admin: "Owner", manager: "Manager", coach: "Coach" };
const rolePriority = { admin: 0, manager: 1, coach: 2 };
```