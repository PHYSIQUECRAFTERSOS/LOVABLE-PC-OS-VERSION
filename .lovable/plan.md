## Problem
`TransferClientDialog` only lists users with role `coach` or `admin` when populating the "Select New Coach" dropdown, so managers never appear as transfer targets. The backend edge function `manage-client-status` already accepts managers as valid transfer targets — this is purely a frontend filter bug.

## Fix
Update `src/components/clients/TransferClientDialog.tsx`:
- Change the `user_roles` query from `.in("role", ["coach", "admin"])` to `.in("role", ["coach", "admin", "manager"])` so managers appear in the coach list.

No backend/edge function changes needed — `manage-client-status` already validates target as `coach | admin | manager`.

## Optional label tweak
Rename the dropdown label from "Select New Coach" → "Select New Coach or Manager" for clarity (single-line copy change in the same file).