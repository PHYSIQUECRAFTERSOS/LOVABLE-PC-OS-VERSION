

# Client Preview Popup, Deactivate/Delete, and Deactivated Tab

## Overview
Replace the current "click to navigate" behavior on client cards with a Trainerize-style preview dialog. Add deactivate/delete functionality and a "Deactivated" tab to the Clients page.

## Changes

### 1. New Component: `ClientPreviewDialog.tsx`
**File:** `src/components/clients/ClientPreviewDialog.tsx`

A `Dialog` that opens when clicking a client card. Fetches and displays:
- **Header**: Avatar, name, "Open" button (navigates to `/clients/:id`), dropdown with "Deactivate" and "Delete" options
- **Stats row**: Current weight (from `weight_logs`), age/height/gender (from `onboarding_profiles`), body fat (from `onboarding_profiles.bodyfat_final_confirmed`)
- **Program info**: Current program name + phase (from `client_program_assignments`)
- **Compliance rings**: Exercise compliance (7d `workout_sessions`) and Nutrition compliance (7d `nutrition_logs` vs `nutrition_targets`)
- **Activity**: Last signed in (from `profiles.updated_at`), last message sent/received (from `thread_messages` via `message_threads`)
- **Macros today**: Calories/protein/carbs/fat from today's `nutrition_logs` vs targets

Data fetched in a single `useEffect` with parallel Supabase queries.

### 2. Deactivate Client Flow
- **UI**: Confirmation `AlertDialog` ("Are you sure you want to deactivate {name}?")
- **Action**: Updates `coach_clients.status` from `"active"` to `"deactivated"` for the coach+client pair
- **Effect**: Client no longer appears in Active Clients tab; client's auth account is soft-banned via `supabase.auth.admin.updateUserById` through a new edge function
- **Edge function**: `supabase/functions/manage-client-status/index.ts` — accepts `{ action: "deactivate" | "reactivate" | "delete", clientId }`, validates coach ownership, then:
  - Deactivate: updates `coach_clients.status = 'deactivated'`, bans user (`ban_duration: "876000h"`)
  - Reactivate: updates `coach_clients.status = 'active'`, unbans user (`ban_duration: "none"`)
  - Delete: deletes all client data (profile, logs, sessions, etc.) and calls `auth.admin.deleteUser()`

### 3. Delete Client Flow
- **UI**: Confirmation `AlertDialog` with destructive styling ("This will permanently delete {name}'s account and all data. Type DELETE to confirm.")
- **Action**: Calls the same edge function with `action: "delete"`
- **Effect**: Removes user from auth, deletes profile + all associated data

### 4. Deactivated Clients Tab
**File:** `src/pages/Clients.tsx`
- Add a 4th tab: "Deactivated" with `UserX` icon
- New component `DeactivatedClientsList.tsx` that queries `coach_clients` where `status = 'deactivated'`
- Each row shows client name/avatar with a "Reactivate" button (confirmation dialog → calls edge function with `action: "reactivate"`)

### 5. Update `SelectableClientCards.tsx`
- Change card click handler: instead of `navigate()`, set `previewClientId` state and open `ClientPreviewDialog`
- Pass `onClientDeactivated` callback to refresh the client list after deactivation

### 6. Database Migration
- No schema changes needed — `coach_clients.status` already supports string values; we'll use `"deactivated"` alongside existing `"active"`

### Files Changed

| File | Change |
|------|--------|
| `src/components/clients/ClientPreviewDialog.tsx` | **New** — Preview popup with stats, Open/Deactivate/Delete |
| `src/components/clients/DeactivatedClientsList.tsx` | **New** — List of deactivated clients with reactivate |
| `src/components/clients/SelectableClientCards.tsx` | Card click opens preview instead of navigating |
| `src/pages/Clients.tsx` | Add "Deactivated" tab |
| `supabase/functions/manage-client-status/index.ts` | **New** — Edge function for deactivate/reactivate/delete |

