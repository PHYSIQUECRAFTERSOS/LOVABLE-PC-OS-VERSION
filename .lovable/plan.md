# "How To Approach It" — readability fix

Scope: only the 3 numbered step cards inside `EatingOutCheatSheet.tsx`. Nothing else on the page changes.

## What changes

- Switch each step card from horizontal (number-left, text-right) to **vertical stack**: gold number tile on top, full-width instruction text below
- Number tile becomes a small inline gold pill (not a tall side rail), sitting at the top-left of the card
- Instruction text now occupies the full card width on its own line(s) — no narrow column, no awkward wrapping, no overlap with highlighted words
- Key phrases (`protein`, `side`, `sauce on the side`) stay **gold + bold inline** exactly as before
- Wording stays verbatim
- Card padding bumps slightly so the text breathes; gold border tint stays the same

## Visual before/after

```text
BEFORE                          AFTER
┌──────────────────┐           ┌──────────────────────────┐
│      │ Look for  │           │ ┌──┐                     │
│  01  │ something │           │ │01│                     │
│      │ protein   │           │ └──┘                     │
│      │ on the…   │           │ Look for something with  │
└──────────────────┘           │ protein on the menu. The │
                               │ protein list above shows │
                               │ lean sources.            │
                               └──────────────────────────┘
```

## Files

- `src/components/nutrition/EatingOutCheatSheet.tsx` — restructure only the `STEPS.map(...)` JSX block (lines ~187–199). No other section, no other file touched.

## Out of scope

- Sides / Protein / Fats / All Orders tiles (unchanged)
- Tip card, intro banner, Eating Out Examples (unchanged)
- Step copy, key-phrase styling, gold theme tokens (unchanged)
