

## AI Import Fix: Storage Path Mismatch + PDF Text Extraction

### Problems
1. **Storage path mismatch**: Frontend uploads to `{userId}/{jobId}/{filename}` but sends `ai-import-uploads/{userId}/{jobId}/{filename}` to the Edge Function. The function then splits on `/`, treats `ai-import-uploads` as the bucket name (correct) but the resulting path includes the user ID prefix. However, the RLS policy on the bucket uses `storage.foldername(name))[1]` which expects the first folder to be `auth.uid()`. The Edge Function downloads using the service role (bypasses RLS), so the real issue is just path consistency. Looking at the code: frontend constructs `ai-import-uploads/${storagePath}` where storagePath = `${user.id}/${newJobId}/${file.name}`. The function splits this, gets bucket=`ai-import-uploads`, filePath=`${user.id}/${newJobId}/${file.name}`. This should work — unless the upload itself is failing due to the allowed_mime_types constraint (only PDFs and images, no text/plain).

2. **502 from AI Gateway**: 27MB PDF base64-encoded is ~36MB, too large for the gateway. Solution: extract text client-side with `pdfjs-dist`, upload as `.txt` instead.

3. **Bucket mime type restriction**: The bucket only allows `application/pdf` and image types. We need to add `text/plain` so extracted text files can be uploaded.

### Changes

#### 1. Database migration — Update bucket allowed_mime_types
Add `text/plain` to the `ai-import-uploads` bucket's allowed mime types.

```sql
UPDATE storage.buckets 
SET allowed_mime_types = ARRAY['application/pdf','image/png','image/jpeg','image/gif','image/webp','text/plain']
WHERE id = 'ai-import-uploads';
```

#### 2. Install `pdfjs-dist` dependency
```
npm install pdfjs-dist
```

#### 3. `src/components/import/AIImportModal.tsx` — 3 changes

**A. Add PDF text extraction import and helper** (top of file):
```typescript
import * as pdfjsLib from "pdfjs-dist";
pdfjsLib.GlobalWorkerOptions.workerSrc = 
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const textParts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item: any) => item.str).join(" ");
    textParts.push(`--- Page ${i} ---\n${pageText}`);
  }
  return textParts.join("\n");
}
```

**B. In `startProcessing`, convert PDF to text before uploading** (lines 107-123):
- For each PDF file, call `extractTextFromPDF(file)` to get plain text
- Create a `Blob` with `text/plain` type
- Upload the text blob (not the raw PDF) to storage
- For image files, upload as-is (they're small enough)
- Use `uploadData.path` from the Supabase response (not the locally constructed path) when building `filePaths`

**C. Fix path format sent to Edge Function**:
- Pass `"ai-import-uploads/" + uploadData.path` to match what the Edge Function expects (bucket prefix + path)

#### 4. `supabase/functions/ai-import-processor/index.ts` — 2 changes

**A. Handle `.txt` files as plain text** (lines 88-126):
- After downloading the file, check if filename ends with `.txt`
- If `.txt`: decode as UTF-8 text, send as plain text content to the AI (no base64, no image_url block)
- If image: keep existing base64/image_url path (images are small enough)
- Add logging: `console.log("Downloaded file, size:", byteLength, "bytes")`

**B. Handle 502 errors explicitly** (line 171-184):
- If `aiRes.status === 502`, set a clear error message: "AI service temporarily unavailable - please try again in 30 seconds"

### What stays the same
- All fuzzy matching logic
- All save logic (workout, meal, supplement)
- Review step UI
- No other features touched

