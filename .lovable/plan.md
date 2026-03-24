
# Plan: Fix Client Invite Email Delivery Reliably

## What I found

The failure is not a browser-cache issue. It is a backend runtime error in the live invite functions.

Evidence from the current code + live logs:
- `send-client-invite` and `resend-client-invite` both still call `sendLovableEmail(...)` directly with the wrong invocation pattern.
- Live logs show the same production error on the latest published attempts:
  - `Cannot read properties of undefined (reading 'apiKey')`
- The invite row is still being created/updated in `client_invites`, which is why you see the fallback “link copied” behavior.
- Your sender domain is verified and the required secret exists, so the problem is the function implementation, not domain setup.
- The project already has email queue infrastructure (`process-email-queue`, `email_send_log`, `email_send_state`), but the client invite flow is bypassing it.

## Best fix

Instead of sending invite emails directly inside `send-client-invite` / `resend-client-invite`, switch both to the built-in queued app-email flow.

That gives you:
- retry safety
- better observability
- fewer one-off send failures
- consistent branded sending from your verified domain

## Implementation plan

### 1) Refactor client invite sending to use the email queue
Update both:
- `supabase/functions/send-client-invite/index.ts`
- `supabase/functions/resend-client-invite/index.ts`

Changes:
- keep the existing invite token generation, DB write, and auth user creation
- keep the branded HTML email
- replace direct `sendLovableEmail(...)` with a queued payload via `enqueue_email`
- include full branded email metadata in the payload:
  - `to`
  - `from`
  - `sender_domain`
  - `subject`
  - `html`
  - `purpose: "transactional"`
  - `label: "client_invite"`
  - unique `message_id`
- only return success when queueing succeeds
- if queueing fails, return the setup link fallback exactly as today

This is the main reliability fix.

### 2) Patch the same email bug in staff invite fallback
Update:
- `supabase/functions/staff-invite/index.ts`

Reason:
- it has the same direct `sendLovableEmail(...)` pattern in the fallback path for already-registered staff
- even if today’s bug report is about client invites, that path can fail for the same reason later

### 3) Improve resend UX so failures are visible everywhere
Update:
- `src/components/clients/InviteDashboard.tsx`

Reason:
- its resend handler currently ignores the returned result and silently swallows failures
- it should match the better handling already used in `InviteList.tsx`
- if resend cannot be queued, it should show the copied setup link fallback instead of failing quietly

I’ll preserve the existing response shape as much as possible so:
- `AddClientDialog.tsx`
- `AddClientWithAssignmentDialog.tsx`
- `InviteList.tsx`

keep working without broad UI changes.

### 4) Add delivery tracing for debugging
In the invite functions, add clearer logs around:
- invite id
- recipient email
- generated `message_id`
- queue success/failure

That makes it easy to trace one invite from creation to queue to send log.

## How I’ll validate it

### Backend verification
After implementation:
1. deploy the updated invite functions
2. trigger a brand-new client invite
3. trigger a resend on an existing invite
4. confirm:
   - no runtime error in function logs
   - rows appear in `email_send_log`
   - status progresses to `sent` instead of failing immediately

### End-to-end verification
Then do one real delivery check with a test inbox:
- send a fresh client invite
- confirm branded email arrives
- use resend
- confirm the resent email also arrives with the updated link

Note: I can fully verify the backend pipeline and sent status. Actual inbox placement still depends on the recipient mailbox provider, so I’ll do one real inbox spot-check as the final confirmation.

## Files to update
- `supabase/functions/send-client-invite/index.ts`
- `supabase/functions/resend-client-invite/index.ts`
- `supabase/functions/staff-invite/index.ts`
- `src/components/clients/InviteDashboard.tsx`

## Expected outcome
After this change:
- new client invites should queue and send reliably from your branded domain
- resends should work the same way
- the current `apiKey` runtime crash will be eliminated
- incognito / publish cache will no longer matter because the actual backend bug will be fixed
