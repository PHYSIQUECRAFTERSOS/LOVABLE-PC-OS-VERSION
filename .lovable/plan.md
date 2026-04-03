

## Add "Change Password" Section to Settings

### Overview
Add a Trainerize-style "Change Password" card to the Profile/Settings page, available to all roles. Three fields: current password, new password, confirm new password. After success, a confirmation email is sent. **No password rules** — only a 4-character minimum.

### Implementation

**1. Create `src/components/settings/ChangePasswordSection.tsx`**

- Three fields: Original Password, New Password, Confirm New Password
- Only two validations: minimum 4 characters, passwords match
- No uppercase/lowercase/special character/number rules
- On submit:
  1. Verify current password via `supabase.auth.signInWithPassword`
  2. Call `supabase.auth.updateUser({ password: newPassword })`
  3. Send confirmation email via `send-transactional-email` edge function with `password-changed-confirmation` template
  4. Show success toast, clear all fields
- Styled as a Card matching existing settings cards (dark theme, gold accent)

**2. Create email template `supabase/functions/_shared/transactional-email-templates/password-changed-confirmation.tsx`**

- Simple notification: "Your password was just changed. If this wasn't you, contact support immediately."
- Branded with gold accent (#D4A017)

**3. Update `registry.ts`**

- Import and register the new template

**4. Update `src/pages/Profile.tsx`**

- Add `<ChangePasswordSection />` after `<NotificationSettings />`, before the Legal card

**5. Test the full flow in browser**

### Files Affected
- `src/components/settings/ChangePasswordSection.tsx` (new)
- `supabase/functions/_shared/transactional-email-templates/password-changed-confirmation.tsx` (new)
- `supabase/functions/_shared/transactional-email-templates/registry.ts` (edit)
- `src/pages/Profile.tsx` (edit)

