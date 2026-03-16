

# Fix: "Copy Meal Plan to Client" Shows No Clients

## Root Cause

In `MealPlanTemplateLibrary.tsx` line 104, the query uses:
```typescript
.select("client_id, profiles!coach_clients_client_id_fkey(user_id, full_name, avatar_url)")
```

There is no foreign key from `coach_clients.client_id` to `profiles.user_id` — both reference `auth.users(id)` independently. This join silently fails, returning `null` for the profiles data, so every client maps to `{ id, full_name: "Client", avatar_url: undefined }` — but actually the entire result likely returns empty or the mapping fails.

The working pattern already exists in `MasterLibraries.tsx` (lines 110-126): fetch `coach_clients` for IDs, then fetch `profiles` separately, then merge.

## Fix

Replace `openCopyToClient` (lines 101-113) with the two-step pattern:

1. Fetch `coach_clients` → get `client_id[]`
2. Fetch `profiles` where `user_id` in those IDs → get names/avatars
3. Merge into client list

## Files Changed

| File | Change |
|------|--------|
| `src/components/nutrition/MealPlanTemplateLibrary.tsx` | Replace FK join query with two-step fetch in `openCopyToClient` |

