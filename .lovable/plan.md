

## Plan: Suggested Foods + Over-Target Ring Visual

Two focused features to level up the nutrition tracker UX.

---

### Feature 1: "Suggested Foods" Based on Remaining Macros

**What it does**: When a client has macros remaining, show a "Suggestions" section below the Remaining summary card with 3–4 foods from their history that fit the remaining budget. One-tap to log instantly.

**How it works**:
1. **New component**: `src/components/nutrition/SuggestedFoods.tsx`
   - Props: `remaining` (cal/p/c/f), `userId`, `dateStr`, `onLogged`
   - Only renders when remaining calories > 100 and at least one macro > 5g
   - Queries `user_food