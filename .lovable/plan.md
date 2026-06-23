## Goal

Replace the markdown-rendered "Eating Out Cheat Sheet" and "Eating Out Examples" guide sections with structured, on-brand cards — matte black + gold with subtle section tints, vertical numbered step cards for the "How to approach it" flow — visually distinct from the Macro Replacement Chart so clients don't confuse the two.

## Implementation

### New component: `src/components/nutrition/EatingOutCheatSheet.tsx`

Hardcoded layout (mirrors how `MacroCheatSheetGrid` lives inside `GuideSection.tsx`). Wrapped in the same outer `Card` shell `GuideSection` already uses, so the section header (`🍽️ Eating Out Cheat Sheet`) stays consistent with the rest of the feed.

Structure top → bottom:

1. **Sides** — `bg-success/5 border-success/20` tint. Pill-tag rows for each item with the qualifier in muted text (e.g. `Rice` · small gray `ask for plain`).
2. **All Orders** — single highlight tile: `Ask for sauce on side — use sparingly` with a gold sauce icon.
3. **Fats** — `bg-warn/5 border-warn/20` tint, short paragraph.
4. **Protein** — `bg-destructive/5 border-destructive/20` tint, split into two clearly labeled sub-blocks:
   - `MORE POPULAR` (gold left bar): Chicken, Shrimp, Extra lean steak, White fish — each rendered as a pill chip with optional qualifier line underneath
   - `LESS POPULAR` (muted left bar): Bison, Tuna, Egg whites, Turkey, Salmon
5. **How To Approach It** — three vertical numbered cards. Each card: gold circular `01` / `02` / `03` numeral on the left, instruction text on the right. Subtle gold-tinted card background `bg-[hsl(var(--primary))]/5 border-[hsl(var(--primary))]/20`. Highlighted keywords (`protein`, `side`, `sauce on side`) stay gold.
6. **Tip callout** — gold-bordered blockquote with `Tip:` label, identical position/spacing to current.

Icons via Lucide (`UtensilsCrossed`, `Salad`, `Droplets`, `Beef`, `ListChecks`, `Lightbulb`) — keeps it distinct from the Macro Chart which uses emoji + bold per-macro colors.

### New component: `src/components/nutrition/EatingOutExamples.tsx`

Same visual language as the cheat sheet (subtle tints, gold accents, Lucide icons) so they feel like a matched pair. The current Examples content (parsed once from DB to capture structure) becomes hardcoded example cards — restaurant name + recommended order + macro estimate per card. If structure is non-uniform after inspection, fall back to numbered example cards (`Example 1`, `Example 2` …) with the body text formatted in the new card style.

### Wire-in: `src/components/nutrition/GuideSection.tsx`

Add two new branches alongside the existing `macro_cheat_sheet` check:

```
if (sectionKey === 'eating_out_cheat_sheet') return <EatingOutCheatSheet />
if (sectionKey === 'eating_out_examples')   return <EatingOutExamples />
```

Both render inside the same `Card` shell so the outer header/border styling stays consistent.

The DB rows for these two sections are left untouched (so coach overrides don't crash anything), but the markdown body is ignored in favor of the hardcoded layout — matching how `macro_cheat_sheet` already works.

## Files touched

- `src/components/nutrition/EatingOutCheatSheet.tsx` — new
- `src/components/nutrition/EatingOutExamples.tsx` — new
- `src/components/nutrition/GuideSection.tsx` — add two `sectionKey` branches and skip the empty-content early return for these keys

## Out of scope

- No database/migration changes
- No coach-side guide editor changes (coaches keep editing the markdown; it just won't render on the client side for these two keys, same pattern as the Macro Chart today)
- No changes to other guide sections
