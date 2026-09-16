# Fix progress photo dates showing one day earlier

## What's wrong

Photo dates are stored as a plain calendar day (e.g. `2026-09-15`). When the expanded photo views turn that into a date for display, it is read as midnight UTC, which in Vancouver (UTC-7) falls on the previous evening — so `Sep 15` renders as `Sep 14`.

The gallery you see first in the client Progress section reads a different field (the upload timestamp), which is why it shows the correct day and the popup does not.

## The fix

Read every photo date at midday instead of midnight so the calendar day never shifts, regardless of the viewer's timezone. Confirmed places with the shift:

- Expanded progress photos popup (gallery labels, compare view, download filenames context) — `src/components/dashboard/ProgressPhotosModal.tsx` (lines 152, 192, 219, 340)
- Client progress photo grid — `src/components/clients/workspace/ProgressTab.tsx` (line 210): switch from the upload timestamp to the photo's own date, formatted safely, so the grid and popup always agree
- Client photo timeline — `src/components/biofeedback/PhotoTimeline.tsx` (line 91)
- Photo comparison slider — `src/components/biofeedback/PhotoComparisonSlider.tsx` (lines 68, 190, 322)
- AI body fat photo strip — `src/components/biofeedback/BodyFatEstimation.tsx` (line 335)

The calendar-side views (`ProgressPhotoCompareModal.tsx`, `PhotosEventPanel.tsx`) already use the safe midday pattern and stay unchanged.

## Technical notes

- Add a small shared helper (e.g. `parsePhotoDate(ymd)` returning `new Date(ymd + "T12:00:00")`) and use it in place of `new Date(photo.photo_date)` in the files listed above; this matches the existing convention already used in the calendar panels and the `getLocalDateString()` policy.
- Presentation-only change: no database, query, or upload-logic changes. Upload still writes the local day via `format(new Date(), "yyyy-MM-dd")`.
- Verify by opening a client's Progress tab and the expanded popup: grid label, popup label, and compare view must all read the same day as the day the photo was taken.
