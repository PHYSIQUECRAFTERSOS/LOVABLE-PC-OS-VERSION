I’ll rework the workout AI import so this Trainerize PDF imports as the correct 9 workouts instead of 20+ tiny workouts.

Plan:

1. Improve PDF text extraction before AI processing
- Preserve line breaks and row order from PDF text instead of joining each page into one long line.
- This helps the importer keep workout headings, superset blocks, exercise rows, reps, sets, and rest times together.

2. Add a Trainerize-specific pre-parser for workout boundaries
- Detect Trainerize print-log PDFs by text such as `trainerize.com`, `PrintTrackingLog`, or the known export structure.
- Extract the real workout headings before sending to AI.
- Preserve separate headings like:
  - `[AWAY]Day 1: Upper`
  - `[AWAY]Day 2: Legs A & Core A`
  - `Mobility lower body`
  - `[AWAY]Day 3: Upper`
  - `[AWAY]Day 4: Lower & Core`
  - `Day 1: UPPER A`
  - `Day 2: LOWER A & calves & abs`
  - `Day 3: UPPER B`
  - `Day 4 : LOWER B & calves & abs`
- Treat `[AWAY]Day 1` and `Day 1` as different workouts, not duplicates.

3. Send AI a structured boundary summary
- Prepend a machine-readable summary to the uploaded text showing the exact 9 workout names and their exercise rows.
- Update the edge-function prompt to require the AI to use that summary as the source of truth when present.
- Explicitly prevent the AI from turning instruction pages, exercise-demo pages, tracking sheets, previous stats, or repeated boilerplate into new workouts.

4. Add server-side validation and cleanup
- After AI extraction, dedupe repeated headings while preserving `[AWAY]` variants.
- Reject or repair incorrectly split workout lists when a Trainerize boundary summary is present.
- Keep only workouts that match the detected heading list.

5. Test with the attached PDF
- Add a targeted test using the PDF/text extraction output to verify exactly 9 workouts are detected.
- Verify the important workout names are preserved exactly.
- Verify exercises are grouped under the correct workout instead of becoming separate 2–3 exercise workouts.

Files to update:
- `src/components/import/AIImportModal.tsx`
- `supabase/functions/ai-import-processor/index.ts`
- Add a shared/helper parser for Trainerize workout PDFs
- Add a focused test for this PDF structure