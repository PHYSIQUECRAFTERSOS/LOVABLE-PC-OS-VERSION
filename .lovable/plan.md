

## AI Import Fix: Anthropic 413 Request Too Large

### Root Cause
The edge function logs confirm: `Anthropic error: 413 {"error":{"type":"request_too_large","message":"Request exceeds the maximum size"}}`. The 27MB PDF becomes ~36MB as base64, exceeding Anthropic's API request size limit. The two-phase storage upload works fine — the problem is purely that the base64 payload sent to Anthropic is too large.

### The Fix: Switch to Lovable AI Gateway

Replace the direct Anthropic API call with the **Lovable AI Gateway** using `google/gemini-2.5-pro`. This model handles large documents natively (up to 2M tokens context), the `LOVABLE_API_KEY` is already configured, and it eliminates the 413 size limit entirely. No new API keys needed.

### Changes (1 file only)

**`supabase/functions/ai-import-processor/index.ts`** — Replace the Anthropic fetch block with a Lovable AI Gateway call:

1. Remove the `ANTHROPIC_API_KEY` check — use `LOVABLE_API_KEY` instead (already available as env var)
2. Convert the Claude content blocks format to the OpenAI-compatible format that the gateway uses:
   - PDF base64 → inline image/document content parts in the `messages` array
   - Since Gemini handles PDFs natively via the gateway, send the base64 data as an image_url with data URI
3. Call `https://ai.gateway.lovable.dev/v1/chat/completions` with model `google/gemini-2.5-pro`
4. Parse the response from the OpenAI-compatible format (`choices[0].message.content`) instead of Anthropic format
5. Keep all existing logic: storage download, base64 conversion, timeout handling, fuzzy matching, cleanup — unchanged
6. Keep the system prompt and extraction prompts exactly as they are
7. Surface 429/402 rate limit errors clearly to the frontend

### What stays the same
- Storage upload flow in `AIImportModal.tsx` — already working
- Job creation, polling, review step — already working  
- Fuzzy matching engine — already working
- All save logic (workout, meal, supplement) — already working
- No frontend file changes needed
- No other features touched

### Technical Detail
The gateway uses OpenAI-compatible format:
```typescript
const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "google/gemini-2.5-pro",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: [
        { type: "image_url", image_url: { url: `data:application/pdf;base64,${base64}` } },
        { type: "text", text: "Extract all workout data..." }
      ]}
    ],
    max_tokens: 8192,
  }),
});
// Response: response.choices[0].message.content
```

