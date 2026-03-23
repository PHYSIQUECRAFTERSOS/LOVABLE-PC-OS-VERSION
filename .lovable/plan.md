

## Plan: Add "Assign To" field to the Clients page Add Client dialog

**Problem**: The "Add Client" button on the `/clients` page uses `AddClientDialog`, which lacks the "Assign To" dropdown. The Team page uses `AddClientWithAssignmentDialog`, which has it.

**Fix**: Replace `AddClientDialog` with `AddClientWithAssignmentDialog` in `src/pages/Clients.tsx`. One file change.

### Changes

**File: `src/pages/Clients.tsx`**
- Replace the `AddClientDialog` import with `AddClientWithAssignmentDialog`
- Swap the component usage at the bottom of the JSX (same props: `open`, `onOpenChange`, `onInviteSent`)

