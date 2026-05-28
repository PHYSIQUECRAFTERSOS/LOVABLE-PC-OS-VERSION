## Clickable Signed Documents (Preview, Download, Print)

Make every signed document row clickable from both coach views (client's Onboarding tab, Settings > My Documents) and the client's own Settings > My Documents. Each opens a preview modal with **Download** and **Print** actions.

### New shared component — `src/components/signing/SignedDocumentPreviewDialog.tsx`

A reusable Dialog that accepts a signature record + (optional) template body.

Behavior:
1. **Fetch content** when opened:
   - If `pdf_storage_path` exists → create a signed URL from the `signature-records` storage bucket.
   - Always fetch the source `document_templates.body` (joined or via `document_template_id` lookup) so the modal can render an HTML preview even when a PDF is missing.
   - For the legacy Onboarding Waiver (no template row): use the canonical waiver text exported from `src/components/onboarding/OnboardingWaiver.tsx` (extract the existing string into a shared constant `WAIVER_BODY` in `src/lib/legalDocuments.ts`).
2. **Preview**:
   - If a stored PDF URL is available, render it inside an `<iframe>` (desktop) for native print/download UX.
   - Otherwise render the formatted HTML preview using the same paragraph styling as `DocumentViewer` (extract `renderDocumentBody(body)` into `src/lib/legalDocuments.ts` and reuse in both places).
   - Append a "Signature Block" footer: signed name, signed date/time, tier, version, IP (when present).
3. **Download button**:
   - If `pdf_storage_path` exists → trigger browser download of the signed URL (use anchor with `download` attribute).
   - Otherwise generate a PDF on the fly using `jspdf` (`bun add jspdf`) — title, body paragraphs, then the same signature block footer. Filename: `{template_title}_{client_name}_{YYYY-MM-DD}.pdf`.
4. **Print button**: `window.print()` after rendering into a portal-mounted `#print-area` with a print CSS block (`@media print`) that hides app chrome and shows only the document.

### Wiring — coach side

**`src/components/clients/workspace/OnboardingTab.tsx`** (Signed Agreements card):
- Make each row a button that opens `SignedDocumentPreviewDialog`.
- Keep current Download PDF button as a secondary affordance for rows with `pdf_storage_path`; remove for cleanliness once preview modal handles it.
- For the Onboarding Waiver row (no `client_signatures` record), pass a synthetic record `{ title: "Onboarding Waiver / Disclaimer", body: WAIVER_BODY, signed_name: profile.waiver_signature, signed_at: profile.waiver_signed_at, version: "v1", tier: "Onboarding" }`.

**`src/components/signing/SignatureRecordsTable.tsx`** (used in Settings > My Documents for admin/coach/client):
- Replace inline Download icon button with a clickable row that opens the preview dialog. Inside the dialog the Download/Print buttons are available to all viewers.
- Keep tier filter and existing query untouched.

### Client side

The same `SignatureRecordsTable` is rendered for clients (`viewMode="client"`) on Settings > My Documents. Because the dialog is wired at the table level, clients automatically get clickable rows + Download + Print for documents they signed. No RLS changes required (existing policies already allow clients to read their own `client_signatures` + storage URLs).

### Shared utility — `src/lib/legalDocuments.ts`

- Export `WAIVER_BODY` (extracted from `OnboardingWaiver.tsx`; that component now imports the constant).
- Export `renderDocumentBody(body: string): JSX.Element[]` containing the styling logic currently in `DocumentViewer.tsx`. Update `DocumentViewer.tsx` to call this helper.
- Export `formatSignatureFooter(record)` returning a small JSX block + a plain-text version used by the jsPDF generator.

### Dependencies

- `jspdf` — for on-the-fly PDF generation when `pdf_storage_path` is missing.

### Out of scope

- No changes to `document_templates` schema, `client_signatures` schema, or RLS.
- No changes to the document-signing flow itself (`DocumentSigningFlow.tsx`, `ESignaturePanel.tsx`).
- No backfill of PDFs for historical waivers; the on-the-fly generator covers them at download time.
- No changes to admin Document Management (template editor).
