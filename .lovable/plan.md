

# Plan: Gamified Dashboard Rank Card with Live XP Animations

## Summary

Transform the static dashboard rank card into a dopamine-rich, game-like widget with three core mechanics:

1. **Animated XP progress bar** showing real-time fill toward next division
2. **XP-earned animation** — "+5 XP" chip flies from screen center into the card, then the bar visually fills
3. **Proximity glow** — card pulses when within 10 XP of ranking up
4. **Streak fire indicator** — flame icon + streak count on the card

## Changes

### File: `src/components/dashboard/MyRankDashboardCard.tsx` — Full rebuild

**A. Add XP progress bar**
Replace the text-only "33 XP to next" with a visual progress bar (same style as the Ranked page). Show `divisionXP / xpNeeded` with the bar filling proportionally. Tier color used as the bar fill color.

**B. Streak fire indicator**
Show `🔥 N` next to the division label when `current_streak > 0`. Reinforces loss aversion — users won't want to break it.

**C. Proximity glow effect**
When `xpToNext <= 10` and `xpToNext > 0`, add a pulsing border glow using the tier color. CSS animation: `box-shadow` pulse every 2 seconds. Creates urgency — "just one more workout and I rank up."

**D. Listen for XP events from context**
Add a new `onXPGained` callback to the `XPContext`. When XP is awarded anywhere in the app, the dashboard card:
1. Shows a "+N XP" chip that floats up and fades toward the card
2. After 600ms, the progress bar smoothly fills by N XP using CSS transition
3. If the fill crosses 100%, flash the bar gold briefly

### File: `src/hooks/useXPAward.tsx` — Add dashboard notification channel

**E. Broadcast XP gains to dashboard**
Add a `dashboardXPGain` state to context that the dashboard card can subscribe to. When `triggerXP` succeeds, set `dashboardXPGain` with the amount. The dashboard card reads it, plays the animation, then clears it. This avoids prop drilling.

### File: `src/components/ranked/XPToast.tsx` — No changes

The existing XPToast still fires as a bottom-of-screen pill. The new dashboard animation is separate and complementary.

## Visual Design

```text
┌─────────────────────────────────────────────┐
│  [🏆 Badge]  BRONZE V        🔥 3    >     │
│              ████████░░░░  67/100 XP        │
│                                             │
│         ← "+5 XP" chip flies in here        │
└─────────────────────────────────────────────┘

When within 10 XP of next division:
┌─ ✨ subtle gold glow pulse ─────────────────┐
│  [🏆 Badge]  BRONZE V        🔥 3    >     │
│              ███████████░  92/100 XP        │
└─────────────────────────────────────────────┘
```

## Animation Sequence (when XP earned)

```text
t=0ms     "+5 XP" chip appears at screen center, scales up
t=200ms   Chip floats upward toward the rank card position
t=500ms   Chip fades out as it reaches the card
t=600ms   Progress bar width transitions from old% to new% (400ms ease-out)
t=1000ms  If bar crosses 100%: gold flash + haptic
```

## Extra Gamification Suggestions (for future)

These are ideas to discuss — not part of this implementation:

1. **Division rank-up micro-celebration on dashboard** — when the bar fills to 100%, a small confetti burst plays right on the card before the full RankUpOverlay fires
2. **"XP Today" counter** — show daily XP earned as a running tally on the card (e.g. "+23 XP today") to create session momentum
3. **Weekly XP goal** — "150/300 XP this week" with a second mini-bar, creating a completionist drive
4. **Leaderboard position delta** — show "↑2 spots this week" to create social comparison dopamine

## Files to modify
- `src/components/dashboard/MyRankDashboardCard.tsx` — full rebuild with bar, streak, glow, animation
- `src/hooks/useXPAward.tsx` — add `dashboardXPGain` broadcast to context

