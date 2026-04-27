# Fix: AI Import "File upload failed" for Meals & Supplements

## Root cause (confirmed via DB diagnostic)

Looked at `ai_import_jobs` records: **every recent failure** is the same PDF named:

```
 [bi weekly ] Jose Lopez  April 9 2026.pdf
```

— note the **leading space**, **square brackets `[ ]`**, and **double spaces**. The most recent **successful** import was a workout with a clean filename (`Jose 4 day week program.pdf`).

The flow in `src/components/import/AIImportModal.tsx` (line 140) constructs the storage key directly from the filename:

```ts
const storagePath = `${user.id}/${newJobId}/${uploadName}`;
const { data, error } = await supabase.storage
  .from("ai-import-uploads")
  .upload(storagePath, uploadBlob, { upsert: true });
```

Supabase Storage's S3-compatible object key validator rejects keys containing **square brackets, leading/trailing spaces, and certain other characters**. The upload returns an error → we show "File upload failed - check your connection and try again." (which is misleading — it's not a connection issue).

This affects Meals **and** Supplements **and** Workouts equally. The user only noticed it on Meals/Supplements because that's the PDF they happened to use; the workout import that succeeded used a different, clean filename.

The bucket itself (`ai-import-uploads`) is configured correctly: 50MB limit, accepts `application/pdf`, `image/*`, and `text/plain`, with proper RLS policies for the coach's folder. No backend changes needed.

## The fix (single, narrow change)

Add a `sanitizeStorageKey()` helper in `AIImportModal.tsx` and use it when building `uploadName`. It will:

- strip leading/trailing whitespace
- replace any character that isn't `[A-Za-z0-9._-]` with `_`
- collapse runs of `_` into a single `_`
- keep the original extension intact
- preserve the existing PDF→`.txt` conversion behavior

Example transformation:

```
" [bi weekly ] Jose Lopez  April 9 2026.pdf"
  → "_bi_weekly_Jose_Lopez_April_9_2026.txt"
```

The original (unsanitized) filename will continue to be stored in `ai_import_jobs.file_names` for display/audit purposes — only the **storage key** gets sanitized.

## Files to change

1. **`src/components/import/AIImportModal.tsx`** (only file)
   - Add `sanitizeStorageKey(name: string): string` helper near the top of the file (next to `extractTextFromPDF`).
   - In the upload loop (around line 130–140), after computing `uploadName`, pass it through `sanitizeStorageKey()` before building `storagePath`.
   - Improve the error message at line 151 to surface the actual Supabase error (`uploadErr.message`) instead of a hardcoded "check your connection" string, so future filename/permission/size failures are diagnosable instead of looking like network issues.

No other files, no DB changes, no edge function changes, no RLS changes.

## Verification plan (after implementation)

1. **Reproduce the exact failure first** with the user's filename: open AI Import on Master Libraries → Meals → upload the same `[bi weekly ] Jose Lopez April 9 2026.pdf`. Confirm it now reaches the "Processing with AI" step instead of erroring.
2. **Repeat for Supplements tab** with the same file — should also succeed.
3. **Verify workout import still works** with a clean filename (regression check).
4. **Check `ai_import_jobs` table**: new jobs should reach `status='review'` instead of `status='failed'`.
5. **Check edge function logs** for `ai-import-processor` to confirm the function received the sanitized path and could read the file from storage.

## Out of scope (not touched)

- Rest timer redistribution logic from the previous task
- Exercise/food/supplement matching engine
- Edge function prompt or schema
- Any RLS policies
- The `ai_import_jobs` table schema

## Risk assessment

Very low. The sanitization is purely a client-side string transformation on the storage key. The displayed filename in `file_names` stays intact. No existing successful import path is modified — clean filenames already pass through unchanged because alphanumeric/dot/dash/underscore characters are preserved.
