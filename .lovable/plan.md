## Goal

Let coach add a written note to each check-in directly from the **Check-In History** tab on a client's page. Note is saved per check-in, visible to the client in their own check-in history, with push notification + "new note" badge.

## What changes for the user

### Coach side — `ClientCheckinHistory.tsx`

- Each expanded check-in row gets a **Coach Note** section at the bottom.
- Plain `<textarea>` (auto-grows). **Enter inserts a newline** — never submits. No keyboard shortcut.
- Below it: **Save Note** button (gold) + small "Last updated …" timestamp.
- Empty state shows placeholder "Add a note for this check-in…".
- If a note already exists, textarea is pre-filled and editable. Saving overwrites the single note (per your spec — single editable note).
- Tiny "Visible to client" hint under the textarea so you remember.

### Client side — their Check-In History view

- When a check-in has a coach note, show it inline under that week's entry in a gold-bordered card titled "Coach Note", `whitespace-pre-wrap` so line breaks render exactly as typed.
- Read-only.
- Unread indicator: gold dot on the check-in row until they expand/open it.

### Notifications

- On save (insert OR meaningful change), send a push notification to the client: *"Coach left a note on your Week N check-in"*.
- Add an in-app badge on the client's Check-In History tab (count of unread coach notes).
- Mark read when client opens that check-in.

## Data model

Reuse existing `checkin_submissions.coach_response` column (already exists, currently only written from `CheckinReviewDashboard`). No new table needed.

Add two small columns:

- `coach_response_updated_at timestamptz` — drives "Last updated" + change detection.
- `coach_response_read_at timestamptz` — null = unread by client; set when client opens.

RLS: existing policies already let coach update and client read their own submission row. Verify and extend SELECT for client if needed.

## Files

```text
src/components/checkin/ClientCheckinHistory.tsx     # add textarea + Save button per row (coach view)
src/components/checkin/ClientOwnCheckinHistory.tsx  # render note inline (client view) — create if missing
src/pages/Dashboard or client check-in page         # surface unread badge
supabase/migrations/...sql                          # add 2 columns, optional index
supabase edge function (existing push sender)       # trigger on coach_response change
```

(Will confirm the exact client-side history component path during implementation.)

## Behavior rules (your spec, locked in)

- Enter key in the note textarea = newline only. Never submits.
- Submit only via the **Save Note** button (mouse click / tap).
- Single editable note per check-in (not a thread).
- Coach writes; client reads (read-only on client side).

## Suggested improvements (optional — say yes/no to each)

&nbsp;

1. **Markdown-light rendering** on client side: auto-link URLs, preserve bullet lines starting with `-`. Still plain textarea on input. [yes]
2. **"Copy from previous week" button** above the textarea — pre-fills with last week's note so you can tweak instead of retyping common protocols.[yes]
3. **Quick-insert snippets** — small chip row above textarea with your most-used phrases (e.g., "1/2 tsp potassium salt + 500 mL water after meal"). Manageable from a settings page.[no]
4. **Auto-save draft locally** (sessionStorage) so a refresh never loses an unsaved note. Submit still requires button click.[yes]

Tell me which of 1–5 to include and I'll implement.

&nbsp;