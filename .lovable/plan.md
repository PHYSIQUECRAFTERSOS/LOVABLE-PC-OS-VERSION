

# Fix Brand+Food Search Relevance

## Root Cause

The `brandRelevanceScore` function in `search-foods/index.ts` has a critical flaw: it rewards brand matches heavily (+120/+100/+95) but doesn't penalize items that match the brand while **completely missing the food terms**. So "kirkland bagel" returns "Kirkland Fruit Punch" because the brand match alone scores ~160+ points, regardless of whether "bagel" appears anywhere.

The scoring also treats all tokens equally — it doesn't distinguish between brand tokens ("kirkland") and food tokens ("bagel", "chicken", "ground beef").

## Fix Strategy

### 1. `supabase/functions/search-foods/index.ts` — Scoring overhaul

Split query tokens into **brand tokens** and **food tokens** using the BRAND_ALIASES map and known brand words. Then:

- **Food token coverage requirement**: When food tokens exist (e.g., "bagel" in "kirkland bagel"), items that match zero food tokens get a **-80 penalty**. Items matching only some food tokens get a **-40 penalty**.
- **Full coverage bonus**: Items matching ALL food tokens in name AND brand token in brand get a **+60 bonus** (the ideal case — exactly what MyFitnessPal surfaces first).
- **Exact phrase bonus**: If the full food phrase (e.g., "extra lean ground beef") appears contiguously in the name, add **+40**.

Score changes to `brandRelevanceScore`:
```
// Identify brand vs food tokens
const brandTokens = tokens that match any brand alias key
const foodTokens = remaining tokens

// Food coverage scoring
foodTokensInName = count of foodTokens found in name
if foodTokens.length > 0:
  if foodTokensInName == 0: score -= 80   // "Kirkland Fruit Punch" for "kirkland bagel"
  elif foodTokensInName < foodTokens.length: score -= 40
  else: score += 60  // all food tokens found

// Exact food phrase bonus
foodPhrase = foodTokens.join(" ")
if nameLower.includes(foodPhrase): score += 40
```

### 2. `supabase/functions/search-foods/index.ts` — Better brand token detection

Add a helper to classify which tokens are brand-intent vs food-intent:

```typescript
function classifyTokens(tokens: string[], aliases: Record<string, string[]>): 
  { brandTokens: string[], foodTokens: string[] }
```

This checks each token against the BRAND_ALIASES keys and common brand patterns. Tokens like "kirkland", "costco", "trader" become brand tokens; the rest ("bagel", "chicken", "ground", "beef") become food tokens.

### 3. No client-side changes needed

The `AddFoodScreen.tsx` fallback search and the edge function structure are sound — the issue is purely in scoring/ranking within the edge function.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/search-foods/index.ts` | Add `classifyTokens` helper, overhaul `brandRelevanceScore` to penalize brand-only matches and reward full brand+food coverage |

## Expected Outcomes
- "kirkland bagel" → top results are bagels from Kirkland brand
- "kirkland cookie" → top results are cookies from Kirkland brand  
- "kirkland extra lean ground beef" → top results are ground beef from Kirkland
- Generic "kirkland" → still shows variety of Kirkland products (no food penalty since no food tokens)

