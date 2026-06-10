## Two fixes, no native rebuild required

### 1. Grocery list pulls foods from archived (old) meal plans

**Root cause:** `supabase/functions/generate-grocery-list/index.ts` queries `meal_plans` with `client_id` + `is_template = false` but does NOT filter `archived_at IS NULL`. Since the new Master Library "assign" flow archives old plans rather than deleting them, every food the client ever had stays in the AI input forever. That's why "Ground Turkey" and "Yellow Flesh Potatoes" appear even though they aren't in the active plan.

**Fix:** Add `.is("archived_at", null)` to the `meal_plans` query in the edge function (line 37-41). Redeploy. Next "Regenerate" click will only see the current active plan(s). No client code or DB schema changes.

### 2. Export PDF doesn't work on iPhone PWA

**Root cause:** `savePdf()` in `src/utils/pdf/brandedPdf.ts` (mobile-web branch, line 299-316) calls `window.open(blobURL, "_blank")` **after** an `await` chain. iOS Safari treats this as a non-gesture popup and blocks it (or opens a blank tab that immediately closes). The `window.location.href = url` fallback also fails because iOS Safari can't navigate to a `blob:` URL in a PWA standalone context.

**Fix (no rebuild needed):**
- Open the new tab **synchronously at the start of the click handler** (`window.open("", "_blank")`) — this keeps the user-gesture chain. Pass that pre-opened window handle down into `savePdf` and, once the PDF blob is generated, set `preopenedWin.location.href = blobURL`. If the user blocked popups, fall back to a hidden `<a download>` click which iOS PWA does honor for blobs.
- As an additional iOS PWA safety net, generate the PDF as a **data URI** (`doc.output("dataurlstring")`) instead of a blob URL — iOS Safari is more reliable opening data URIs in-tab from a PWA than blob URLs.
- Touched files:
  - `src/utils/pdf/brandedPdf.ts` — refactor `savePdf` to accept an optional pre-opened window and use data-URI for iOS web path; keep native + desktop branches unchanged.
  - `src/components/common/ExportPdfButton.tsx` — open the placeholder tab synchronously inside `handleClick` before any `await`, then hand it to `savePdf` via the existing export functions (thread one optional arg through `exportMealPlanPdf` / `exportSupplementsPdf` / `exportTrainingPdf`).

No Capacitor changes, no new edge function, no native build, no new dependencies.

### Technical detail (for the engineer)

```text
ExportPdfButton.handleClick
   ├── const preWin = isIOSWeb ? window.open("about:blank", "_blank") : null  // synchronous
   ├── await exportXxxPdf(clientId, { preWin })
   │       └── savePdf(doc, filename, { preWin })
   │              ├── native: existing Filesystem branch
   │              ├── mobile web + preWin: preWin.location.href = dataUri
   │              ├── mobile web no preWin: anchor.download fallback
   │              └── desktop: doc.save()
```

### Out of scope
- No changes to meal-plan archive/assign logic (already fixed last turn).
- No changes to grocery-list UI, AI categorization prompt, or DB schema.
- No "email me the PDF" path — only added if the above still fails on the user's device.
