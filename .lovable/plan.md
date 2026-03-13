

# Fix Supplement Scanner: Remove Barcode, Improve AI Photo Analysis

## Problem Summary

1. **Barcode scanning for supplements is fundamentally broken by design** — Open Food Facts and UPC Item DB are *food* databases, not supplement databases. They don't store vitamin/mineral content for supplements. Even when a barcode is found, it returns zero nutrient data. This is why every supplement you've tried returns "Not found."

2. **AI photo label analysis fails ("No nutrients detected")** — The edge function tries `gemini-2.5-pro` then falls back to `gemini-3-flash-preview`. Based on the screenshot showing `"google/gemini-3-flash-preview: No nutrients detected"`, both models are failing. The likely cause is the `tool_choice` format — the current code uses `{ type: "function", function: { name: "..." } }` but the Lovable AI gateway expects OpenAI-compatible format `{ type: "function", function: { name: "..." } }` which may have subtle compatibility issues with Google models. Additionally, the 10-second client-side timeout in `SupplementScanFlow.tsx` may be aborting before the Pro model (15s server timeout) can respond.

## Plan

### 1. Remove barcode scanning from supplement flow
- Simplify `SupplementScanFlow.tsx` to remove the barcode scan step entirely
- Replace with a clean two-step flow: **Photo → Review/Save**
- The dialog opens directly to a "Take Photo of Label" screen
- Keep manual entry as a secondary option

### 2. Fix AI label analysis
- **Edge function (`analyze-supplement-label`)**: 
  - Add `google/gemini-2.5-flash` as a third fallback model (it handles tool calling more reliably than flash-preview)
  - Add a non-tool-calling fallback path: if tool calling fails on all models, retry with a plain text prompt asking for JSON output, then parse it
  - Increase timeouts (20s for pro, 15s for flash models)
  - Log the actual error details so we can debug

- **Client side (`SupplementScanFlow.tsx`)**:
  - Remove the 10-second `AbortController` timeout — let the server-side timeouts handle it
  - Show better progress feedback ("Reading label..." → "Almost done...")

### 3. UX improvements (consultant recommendations)
- Add a "Retake" button if analysis fails, instead of dumping user to empty manual form
- Show the captured photo thumbnail during analysis so user can verify image quality
- Pre-populate the review form with "Unknown Supplement" as default name if AI can't detect it

### Files to edit
- `src/components/nutrition/SupplementScanFlow.tsx` — Remove barcode step, fix timeout, improve UX
- `supabase/functions/analyze-supplement-label/index.ts` — Add fallback models and non-tool-calling retry path

