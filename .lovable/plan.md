## Why "Unknown" appears today

Looking at your PDF + the current import code, three things combine:

1. **AI loses the name on ALL-CAPS section headers.** The PDF writes `MULTIVITAMIN` as a heading, then `Triumph` (brand) on the next line, then `3 pills / day`. The model picks up "3 pills" but submits the supplement with an empty `name`. Same problem for `VITAMIN D3 + K2` → it splits into two rows ("5000 IU", "90 MCG") with no name, and the user-visible `BERBERINE` heading.
2. **Combo entries get split.** `VITAMIN D3 + K2` becomes two unnamed rows instead of one combo with both dosages.
3. **Catalog matching is too strict and dirty.** `master_supplements` already has 5+ versions of Berberine, 4 of Magnesium, "Berberbine" (typo), etc. The 80% auto-accept threshold blocks anything that doesn't exactly match, so a brand-new (blank-named) row gets created and surfaces as "Unknown".

## What I'll change

### 1. Harden the AI extraction prompt — `supabase/functions/ai-import-processor/index.ts`

Update the supplement extraction schema/instructions:

- **MANDATORY rule:** `name` must never be empty. If a dosage line has no inline product name, walk **upward** to the nearest ALL-CAPS heading (`MULTIVITAMIN`, `VITAMIN D3 + K2`, `BERBERINE`, `FISH OIL`, `IODINE`, `PROBIOTICS`, `PSYLLIUM HUSK`, `MAGNESIUM`, `CREATINE`) and use it as the name (Title Case).
- **Brand handling:** If a product line follows the heading (e.g. `Triumph`, `Legion`, `CanPrev`), set it as `brand`, not as `name`.
- **Combo entries (per your answer):** If the heading contains `+` or `/` (e.g. `VITAMIN D3 + K2`, `MAGNESIUM SUCROSOMIAL OR BIGLYCINATE`), output ONE row whose `name` is the full combo, `dosage`/`dosage_unit` use the first listed dosage, and the additional dosages go into `coach_note` (e.g. `coach_note: "D3 5000 IU + K2 90 MCG"`).
- **Examples block in the prompt** showing the exact Triumph multivitamin / D3+K2 / Berberine patterns from your weekly PDF so the model sees the template it should match.
- **Final guard:** If the model still can't determine a name, output `"name": "Unmapped Supplement"` (never blank).

### 2. Seed a clean Master Supplement catalog with synonyms

Two-part migration:

**a. Insert canonical master rows** (only if name not already present, `is_master=true`, `is_active=true`) for the Physique Crafters standard list:

```text
Multivitamin (Triumph)         Berberine             Fish Oil
Vitamin D3 + K2                Magnesium Glycinate   Iodine
Probiotics (25B)               Psyllium Husk         Creatine Monohydrate
Ashwagandha KSM-66             Aloe Vera Drink       Apple Cider Vinegar
Greens Powder                  CoQ10 Ubiquinol       NAC
Methylcobalamin B12            Methylfolate L-5-MTHF Boron
Glutamine                      EAA                   Protein Powder (Whey Isolate)
Caffeine                       Citrus Bergamot       Digestive Enzyme
DIM                            Krill Oil             Magnesium Citrate
Melatonin                      Iron                  Taurine
```

**b. Create `supplement_synonyms` table** (mirrors `exercise_synonyms`) and seed common mappings so the matcher resolves variants:

```text
multivit, multi-vit, multi vitamin, triumph multivit → multivitamin
vit d, vit d3, d3, vitamin d, vitamin d 3 → vitamin d3
vit k, k2, vit k2, vitamin k → vitamin k2
vitamin d3 k2, d3 + k2, d3 plus k2 → vitamin d3 + k2
berberine hcl, berberbine → berberine
fish oils, omega 3, omega-3, epa dha → fish oil
mag glycinate, magnesium bisglycinate, mag biglycinate, mag sucrosomial → magnesium glycinate
psyllium, psyullium husk, meta mucil → psyllium husk
probiotic, 25b, 25 billion, probiotics 25b → probiotics (25b)
ashwagandha ksm 66, ashwaganada ksm 66, ashwaghanda → ashwagandha ksm-66
creatine mono, creatine monohydrate → creatine
b12, methyl b12 → methylcobalamin b12
```

The matcher already loads `exercise_synonyms` — I'll add a parallel `loadSupplementSynonyms()` and use it in `matchSupplements()`.

### 3. Loosen + smarten supplement matching — `matchSupplements()`

- Lower auto-accept score from **80 → 65** for supplements only (names are short, so trigram scores run lower than for exercises).
- Add a tie-breaker: if the normalized PDF name is a substring of (or contained in) a catalog name (e.g. `"multivitamin"` ⊂ `"Multivitamin (Triumph)"`), force-accept that match.
- Prefer `is_master=true` catalog rows when scores tie, so seeded canonical rows win over the duplicates.

### 4. Safety net in the import commit — `src/components/import/AIImportModal.tsx`

In the supplement insert loop:
- If `supp.name` is empty/whitespace, skip the row entirely (don't create a blank master_supplement) and log a warning toast at the end: "X supplements skipped — couldn't read name."
- When creating a new master_supplement, default any blank name to `"Unmapped Supplement"` so nothing ever lands as literal empty/`Unknown`.

### 5. Verify against your PDF

After deploy, I'll re-run AI Import on `Zach Ivie weekly progress updates May 18 2026-2.pdf` and confirm:
- ✅ `Multivitamin (Triumph)` — 3 pills, with meal 1
- ✅ `Vitamin D3 + K2` — 5000 IU, with meal 1, note "D3 5000 IU + K2 90 MCG"
- ✅ `Berberine` — 500 mg, with meal 2 (workout) / meal 1 (rest)
- ✅ `Fish Oil`, `Iodine`, `Probiotics`, `Psyllium Husk`, `Magnesium` all match cleanly

### Files touched
- `supabase/functions/ai-import-processor/index.ts` — prompt + match logic + synonym loader
- `src/components/import/AIImportModal.tsx` — commit-time safety net
- One DB migration — `supplement_synonyms` table + seed canonical master_supplements + seed synonym rows

### What stays the same
- No existing supplements/plans are touched. Seeding only inserts when the name doesn't already exist (case-insensitive).
- No UI changes to the supplement library, plans, or import modal layout.
- The Personal vs Shared distinction is preserved (seeds are `is_master=true`, owned by your admin user).
