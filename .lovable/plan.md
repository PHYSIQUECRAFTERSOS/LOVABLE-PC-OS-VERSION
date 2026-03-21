

# Epic Rank-Up Animation System

## Overview

Replace the current basic `RankUpOverlay` with a multi-stage cinematic celebration system that differentiates between **division promotions** (subtle but satisfying) and **tier promotions** (full-screen dramatic event). The goal: maximum dopamine, lottery-winner energy.

## Animation Tiers (3 intensity levels)

### Level 1: Division Up (Bronze V → IV, etc.)
- Duration: **3 seconds**
- Quick badge pulse + radial particle burst in tier color
- Division label slides in with a scale-bounce
- Subtle shimmer sweep across badge
- Sound: short ascending chime

### Level 2: Tier Up (Bronze I → Silver V, Silver I → Gold V, etc.)
- Duration: **5.5 seconds**
- Full-screen dark overlay with dramatic fade-in
- Stage 1 (0-1s): Old tier badge fades out with dissolve particles
- Stage 2 (1-2.5s): New tier badge scales up from 0 with spring bounce + golden light rays radiating outward
- Stage 3 (2.5-4s): Massive confetti burst (canvas, 120+ particles in new tier colors) + tier name reveals letter-by-letter with glow
- Stage 4 (4-5.5s): Badge pulses with glow halo, subtitle fades in, auto-dismiss
- Sound: epic ascending fanfare

### Level 3: Champion Achieved
- Duration: **7 seconds**
- Everything from Level 2 but amplified
- Double particle waves (burst at 1.5s and 3s)
- Badge entrance with slow-motion scale (0.4 → 1.2 → 1.0 spring)
- Pulsing red/gold light rays behind badge
- Screen-edge golden shimmer border
- "CHAMPION" text with per-character stagger animation
- "Only 5 can hold this rank" with dramatic pulse
- Sound: grand orchestral hit

### Demotion (division_down, tier_down)
- Duration: **3 seconds** (keep quick, don't dwell)
- Badge slides down with subtle shake
- Muted color palette, no particles
- Motivational text: "Time to fight back!"
- Sound: none (silence is more impactful)

## Technical Architecture

### Files to create/modify

| File | Action |
|---|---|
| `src/components/ranked/RankUpOverlay.tsx` | **Rewrite** — multi-stage animation engine with canvas confetti, CSS keyframes for badge/text reveals, stage-based rendering using `useState` + `useEffect` timers |
| `src/components/ranked/RankUpConfetti.tsx` | **New** — dedicated canvas confetti component with tier-colored particles, configurable intensity (40 particles for division, 120 for tier, 200 for champion) |
| `src/services/RankUpAudioService.ts` | **New** — singleton audio service using Web Audio API (reuse pattern from RestTimerAudioService), pre-loads 3 sound files, exposes `playDivisionUp()`, `playTierUp()`, `playChampionIn()` |
| `public/sounds/division-up.mp3` | **New** — short chime (~1s) |
| `public/sounds/tier-up.mp3` | **New** — fanfare (~2s) |
| `public/sounds/champion.mp3` | **New** — epic orchestral hit (~3s) |
| `src/hooks/useXPAward.tsx` | **Minor edit** — pass `previousTier` to overlay so it can show the "old → new" transition |

### Sound Effects Plan

Generate 3 MP3 files using ElevenLabs Sound Effects API via a backend function:
1. **Division chime**: "Short bright ascending chime, achievement unlock sound, mobile game, 1 second"
2. **Tier fanfare**: "Epic short fanfare, triumphant brass and strings, rank up achievement, video game, 2 seconds"  
3. **Champion hit**: "Grand orchestral hit with choir, ultimate achievement unlocked, epic cinematic moment, 3 seconds"

These get saved to `public/sounds/` as static assets.

### Animation Implementation Details

**Canvas confetti** (RankUpConfetti.tsx):
- Reuses the proven `ConfettiBurst` pattern but enhanced
- Particles: rectangles + circles + star shapes
- Physics: gravity, air resistance, rotation, variable opacity fade
- Colors pulled from `TIER_CONFIG[tier].color` plus complementary shades
- For tier-ups: two-wave burst (initial explosion + delayed secondary)

**Badge entrance** (CSS keyframes in RankUpOverlay):
- Division up: `scale(0.6) → scale(1.15) → scale(1.0)` spring with `opacity 0→1`
- Tier up: staged — glow ring expands first, then badge scales in with overshoot
- Champion: slow dramatic scale `0.3 → 1.3 → 1.0` over 2 seconds with light ray rotation behind

**Text reveals**:
- Division label: slide-up with fade, single motion
- Tier name: per-character stagger (each letter delays 50ms), scale-bounce per character
- "CHAMPION": per-character with 80ms stagger, golden glow text-shadow pulse

**Light rays** (tier-up and champion only):
- 8-12 CSS div elements positioned radially behind badge
- Slow rotation animation (full 360° over 8s)
- Gradient from tier color → transparent
- Creates the "divine light" effect behind the badge

### RankUpOverlay State Machine

```text
Stage 0 (0ms)      → Overlay fades in, old tier dissolves (tier-up only)
Stage 1 (800ms)    → Light rays appear, confetti wave 1
Stage 2 (1500ms)   → Badge springs in
Stage 3 (2500ms)   → Text reveals, confetti wave 2 (tier-up)
Stage 4 (4000ms)   → Subtitle fades in, glow pulse
Stage 5 (duration) → Auto-dismiss with fade-out
```

Each stage triggered by `setTimeout` chains in a `useEffect`. All visual state driven by a `stage` number in `useState`.

### Audio Integration

The `RankUpAudioService` follows the same singleton + Web Audio API pattern as `RestTimerAudioService`:
- Pre-fetches and decodes all 3 MP3s into `AudioBuffer`s on first load
- `playDivisionUp()` / `playTierUp()` / `playChampionIn()` create `BufferSource` nodes
- Called from `RankUpOverlay` at Stage 1 (when the celebration begins)
- No unlock needed here since overlays always appear after a user interaction (logging a set, etc.)

### Edge Function for SFX Generation

Create `supabase/functions/generate-sfx/index.ts` that calls ElevenLabs Sound Effects API. This is a one-time utility — generate the 3 sounds, download them, commit to `public/sounds/`. After that the edge function isn't needed at runtime.

## Improvements Included

1. **Previous tier shown**: For tier-ups, briefly flash the old tier badge before transitioning to the new one — reinforces the "journey" feeling
2. **Haptic feedback**: Call `navigator.vibrate([100, 50, 200])` on tier-ups for physical feedback on mobile
3. **Tap to dismiss**: Keep existing tap-to-dismiss but with a graceful fade-out (300ms) instead of instant removal
4. **Accessibility**: `prefers-reduced-motion` media query — if enabled, skip particles and use simple fade transitions only

