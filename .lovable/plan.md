

# Plan: Fix Text Cutoff + Premium Guide Preview in PlanTab

## Problem

1. **Text cutoff**: Line 435 in `PlanTab.tsx` uses `line-clamp-4` CSS class, which truncates all guide content to 4 lines — cutting off words mid-sentence
2. **Plain rendering**: The coach-side guide preview uses raw `ReactMarkdown` without the premium custom components (gold chevrons, step cards, etc.) that exist in `GuideSection.tsx`
3. **No visual appeal**: Guide sections render as tiny muted text crammed into flat bordered divs — no gold accents, no structured layout, no hierarchy

## Solution

### Change 1: Remove text truncation and use GuideSection for preview

**File:** `src/components/clients/workspace/PlanTab.tsx`

Replace the current preview block (lines 434-437) that uses `line-clamp-4` + raw `ReactMarkdown` with the premium `GuideSection` component:

- Import `GuideSection` from `@/components/nutrition/GuideSection`
- When NOT editing, render `<GuideSection title={section.title} content={section.content} sectionKey={section.section_key} />` instead of the clipped raw markdown
- This automatically gives the coach the same premium rendering the client sees: gold chevron bullets, numbered step cards, structured macro grid, gold headers
- Remove `line-clamp-4` entirely — all content is visible

### Change 2: Improve the guide section container styling

**File:** `src/components/clients/workspace/PlanTab.tsx`

- Remove the cramped `rounded-lg border p-3` wrapper div since `GuideSection` already provides its own premium card styling
- Keep the customize/hide controls as a floating toolbar row above the rendered guide
- Add proper spacing between the control bar and the guide content

### Change 3: Improve category section styling

**File:** `src/components/clients/workspace/PlanTab.tsx`

- Make category headers more prominent — larger text, gold accent dot
- Remove the left border-line (`border-l-2`) nesting and use cleaner spacing
- Keep collapsible behavior but default all open

---

## Files Modified

| File | Change |
|------|--------|
| `src/components/clients/workspace/PlanTab.tsx` | Import GuideSection, remove line-clamp-4, use premium renderer for preview, improve layout spacing |

## No Database Changes Needed

