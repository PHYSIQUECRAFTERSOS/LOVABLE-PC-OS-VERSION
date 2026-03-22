

# Epic XP Celebration System — Cardio + Nutrition Daily Rewards

## Game Design Decision: Nutrition XP Timing

Real-time macro celebrations with clawback would create negative emotions — imagine celebrating "Protein Target Hit! +1 XP" then 30 minutes later seeing "-1 XP: Protein Over Target". That is anti-dopamine and trains users to AVOID logging food (the opposite of what we want). In game design, **loss aversion is 2x stronger than gains** — one clawback undoes two celebrations emotionally.

**The winning strategy**: Keep nutrition XP as end-of-day evaluation (existing server logic). Build a "Daily Rewards" celebration popup that fires when the client opens the app after their daily evaluation has run. This creates a **loot-box moment** — they open the app wondering "what did I earn?" — which is the most addictive loop in mobile gaming.

Cardio stays real-time since it is a binary complete/not-complete action with no overshoot risk.

## What We Are Building

1. **Cardio Completion Celebration** — The drawer transforms into a victory state with the crystal runner icon, confetti, animated XP counter, and audio chime
2. **Daily Nutrition Rewards Popup** — A cinematic bottom sheet that fires on app open showing all nutrition XP earned/lost from the previous day's evaluation, using the fork/knife icon
3. **Custom icon assets** — Copy the uploaded cardio and macro icons into the project

## Plan

### 1. Copy Icon Assets
Copy `Cardio_icon.png` and `macro_icon.png` to `src/assets/` for use as ES6 imports in celebration components.

### 2. New Component: `XPCelebrationOverlay`
**File:** `src/components/ranked/XPCelebrationOverlay.tsx`

Bottom-sheet style popup (~45% screen height) with:
- The custom icon image (cardio runner or macro fork/knife) with pulsing glow
- Animated XP counter counting from 0 to total using requestAnimationFrame
- Breakdown lines with staggered fade-in ("Calories on target: +7 XP", "Protein: +1 XP")
- Canvas confetti burst in emerald/gold palette
- Haptic feedback on show
- Auto-dismiss after 4s or tap to dismiss
- Red styling for penalty items (missed targets shown as losses)

```typescript
interface XPCelebrationProps {
  type: "cardio" | "nutrition";
  totalXP: number;
  breakdown: { label: string; xp: number }[];
  onDismiss: () => void;
}
```

### 3. Add `playXPChime()` to `RankUpAudioService`
**File:** `src/services/RankUpAudioService.ts`

Quick 2-note ascending chime (C5 to E5), 0.4s duration, gain 0.2. Lightweight and satisfying.

### 4. Update `useXPAward` Context
**File:** `src/hooks/useXPAward.tsx`

- Add `triggerCelebration(type, breakdown)` method to context
- Renders `XPCelebrationOverlay` when triggered
- Keep `XPToast` for small/routine XP events

### 5. Transform `CardioPopup` Post-Completion
**File:** `src/components/dashboard/CardioPopup.tsx`

After "Mark as Complete" succeeds:
- Transition drawer content to celebration state (no close, no new modal)
- Show the crystal runner icon with scale-bounce animation
- Animated "+3 XP" counter with confetti burst inside drawer
- Play XP chime
- Auto-close after 3.5s

### 6. Daily Nutrition Rewards Popup
**File:** `src/components/ranked/DailyRewardsPopup.tsx`

New component that:
- On mount (wrapped in Dashboard), queries `xp_transactions` for the user where `transaction_type = 'daily_eval'` and the description contains yesterday's date, AND where the user hasn't seen it yet (check `localStorage` key `last_xp_review_date`)
- If unseen nutrition XP transactions exist, show the celebration overlay with the macro icon
- Groups transactions into breakdown lines: "Calories on target: +7 XP", "Protein: +1 XP", "Missed cardio: -2 XP"
- Gains shown in emerald, losses shown in red
- Sets `localStorage` flag after dismissal so it only shows once

### 7. Mount `DailyRewardsPopup` in Dashboard
**File:** `src/pages/Dashboard.tsx`

Add `<DailyRewardsPopup />` inside the client dashboard so it fires on login/app open.

## Files Changed

| File | Change |
|---|---|
| `src/assets/Cardio_icon.png` | **New** — copied from upload |
| `src/assets/macro_icon.png` | **New** — copied from upload |
| `src/components/ranked/