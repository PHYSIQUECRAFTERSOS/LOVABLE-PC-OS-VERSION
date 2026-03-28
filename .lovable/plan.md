

# Plan: Tag-Triggered Automation System (In-App Message + Email)

## The Problem

Today, when you finish a client's program, you manually:
1. Tag the client in Trainerize
2. Zapier detects the tag → sends an in-app message
3. Zapier also sends a welcome email

This is slow, relies on a third-party (Zapier), and lives outside your platform.

## What We're Building

A native "Tag Actions" system inside Physique Crafters OS. When you apply a tag to a client, it automatically:
- Sends a pre-configured **in-app message** via the existing messaging thread
- Sends a branded **email** to the client

All configurable per-tag — you set up the message template and email content once, then every time you apply that tag, it fires instantly.

---

## How It Works (Coach Flow)

1. **Manage Tag Actions** — New section in the client workspace or a settings area where you configure tag automations:
   - Pick or create a tag name (e.g., "VIP PROGRAM COMPLETE")
   - Write the in-app message template (supports `{{client_name}}` placeholder)
   - Write the email subject + body
   - Toggle email on/off per tag

2. **Apply Tags Dialog** — On the client detail page header, a "Tags" button opens a Trainerize-style dialog (like your screenshot) showing all available tags with checkboxes. When you check a new tag and hit "Apply":
   - Tag is saved to `client_tags`
   - If that tag has an automation configured, the in-app message is sent instantly via `thread_messages`
   - Email is queued via the existing email infrastructure

3. **Visual Feedback** — Toast confirms "Tag applied · Message sent · Email queued"

---

## Technical Changes

### 1. New Database Table: `tag_automations`

Stores the message/email template per tag name per coach.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | PK |
| coach_id | uuid | FK to auth.users |
| tag_name | text | The tag that triggers this automation |
| message_content | text | In-app message body |
| email_subject | text | Email subject line (nullable) |
| email_body | text | Email HTML body (nullable) |
| send_email | boolean | Whether to also send email |
| is_active | boolean | Toggle on/off |
| created_at / updated_at | timestamptz | Timestamps |

- Unique constraint on `(coach_id, tag_name)`
- RLS: coaches can CRUD their own rows

### 2. New Component: `TagAutomationDialog` 

A dialog on the **ClientDetail** page header with two modes:
- **Apply Tags** tab: Checkbox list of all tags (like the Trainerize screenshot). Search, select/deselect, Apply button.
- **Manage Automations** tab: Configure what happens when each tag is applied — set message template, email content, toggle email on/off.

### 3. Updated `ClientDetail.tsx`

- Add a "Tags" button next to the existing "Message" button in the header
- Opens `TagAutomationDialog`
- On tag apply: insert into `client_tags`, check `tag_automations` for a matching tag, and if found:
  - Send in-app message via existing `message_threads` / `thread_messages` pattern
  - If `send_email` is true, invoke `send-transactional-email` edge function

### 4. Transactional Email Template: `tag-action-notification`

A branded React Email template for tag-triggered emails. Uses the existing email queue infrastructure (`process-email-queue`). Template accepts `clientName`, `subject`, and `body` as dynamic props so each tag automation can customize the content.

**Requires**: Scaffolding the transactional email infrastructure via `scaffold_transactional_email` since it doesn't exist yet, plus creating the template.

### 5. Edge Function: `send-transactional-email`

Will be scaffolded automatically. The client-side code invokes it with the tag automation's email content.

---

## Files Changed/Created

| File | Action |
|------|--------|
| `supabase/migrations/...` | Create `tag_automations` table + RLS |
| `src/components/clients/TagAutomationDialog.tsx` | New — the full tag management + automation config UI |
| `src/pages/ClientDetail.tsx` | Add Tags button, import dialog |
| `supabase/functions/_shared/transactional-email-templates/tag-action-notification.tsx` | New email template |
| `supabase/functions/send-transactional-email/` | Scaffolded via tooling |

---

## Improvements Over Current Zapier Setup

- **Zero latency** — no webhook delay, message + email fire instantly on tag apply
- **No third-party dependency** — everything runs inside your platform
- **Template management in-app** — edit message/email content without touching Zapier
- **Per-tag granularity** — different automations for different tags (e.g., "VIP PROGRAM COMPLETE" vs "RENEWAL/EXTENSION" can have different messages)
- **Audit trail** — `auto_message_logs` tracks what was sent and when
- **Placeholder support** — `{{client_name}}` in templates auto-fills with the client's name

