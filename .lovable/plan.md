
## Goal
Two mobile-only visual fixes so text isn't cut off / squeezed.

## 1. Training → Program: show full workout names

**File:** `src/components/training/ClientProgramView.tsx` (line ~422)

- Remove `truncate` from the workout name `<p>` and let it wrap to multiple lines (Trainerize-style).
- Change the container at line 387 from `items-center` → `items-start` so the row grows vertically and the thumbnail/Start button stay top-aligned.
- Keep "Day N" badge + name on the same first line via `flex-wrap`; the name itself uses `break-words` and is allowed to wrap to 2–3 lines.
- Apply the same change inside the `weeks` rendering path (if it mirrors the phase path with the same `truncate`).

Result: "DAY 1 : B…" becomes the full "DAY 1 : Back & Biceps" wrapping onto a second line if needed. Start button and thumbnail stay aligned, card just gets taller.

## 2. Clients → Invites: readable name/email + buttons stop crushing the text column

**File:** `src/components/clients/InviteList.tsx` (lines ~262–333)

The current layout puts name+email and the 3 action buttons on the same horizontal row. On mobile the buttons take all the width and force the name column to ~0px, which is why each letter wraps onto its own line.

Changes:
- Switch the outer wrapper from horizontal-only `flex items-start justify-between` to a responsive column → row layout: `flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`.
- Move the action button cluster below the text block on mobile; right-align on `sm:` and up.
- Remove `truncate` from name (`line 268`) and email (`line 276`) — allow them to wrap (`break-words`).
- Tighten the meta line ("Invited X · Expires Y") so it stays on a single readable line.
- Keep desktop appearance unchanged.

Result on mobile: full name "John Smith", full email, then a tidy row of [Copy Link] [Cancel] [Resend] beneath — all readable, no vertical letter-stacking.

## Out of scope
- No backend/data/logic changes.
- No changes to History tab, desktop coach view, or any other page.
