

# Workout Summary — Premium Animated Celebration

## What We're Building

Transform the static workout summary into a cinematic, Apple Fitness+-inspired reveal sequence with smooth staggered entrances, count-up number animations, gold confetti for PR sessions, shimmer effects on PR rows, a trophy burst animation, and a live-filling XP progress bar with tier badge glow pulse.

## Animation Sequence Timeline

```text
0.0s  — Screen fades in (existing)
0.3s  — Hero emoji scales up with bounce
0.5s  — "Workout Complete!" title fades in
0.7s  — Workout name fades in
0.9s  — Stat cards stagger in (top-left → top-right → bottom-left → bottom-right)
1.0s  — Each stat number counts up from 0 to final value over ~800ms, bounces on land
1.8s  — If PRs exist: gold confetti burst fires (40-60 particles)
2.0s  — PR card fades in, trophy icon does a scale-rotate burst
2.2s+ — PR rows stagger in one-by-one (200ms apart), each with a gold shimmer sweep
3.0s  — XP card fades in
3.2s  — "+X XP" counter ticks up rapidly
3.5s  — XP progress bar fills from previous position to new position
3.8s  — Tier badge pulses with a glow ring
4.0s  — Motivational message + action buttons fade in
```

## Technical Approach

### 1. Animated Number Counter Component
Create a reusable `AnimatedNumber` component using `requestAnimationFrame` with easing. Numbers count from 0 to target over ~800ms, then do a CSS scale bounce (1.0 → 1.15 → 1.0) when they land.

### 2. Staggered Entry System
Use CSS `@keyframes` with inline `animation-delay` on each element. Each stat card, PR row, and section gets an increasing delay. No external library needed — pure CSS animations with Tailwind utility classes added to `index.css`.

### 3. Gold Confetti (PR sessions only)
A lightweight canvas-based confetti burst (~50 gold/amber particles) that fires once at the 1.8s mark. Self-contained in a `ConfettiBurst` component — no npm dependency. Particles use physics (gravity + drift) and fade out over ~2s.

### 4. PR Row Shimmer + Trophy Burst
- Each PR row gets a CSS `shimmer` animation: a diagonal gold gradient that sweeps left-to-right once
- Trophy icon does a scale-up + rotate animation on entry

### 5. XP Progress Bar Fill
- Bar starts at 0% width and animates to the calculated percentage using CSS `transition` with a 700ms ease-out, triggered after a delay
- The `+XP` number uses the same count-up component
- Tier badge gets a pulsing glow ring via `box-shadow` animation

### Files Changed

| File | Change |
|---|---|
| `src/components/workout/WorkoutSummary.tsx` | Add animation delays, use `AnimatedNumber`, add `ConfettiBurst`, shimmer classes, staggered PR rows, animated XP bar |
| `src/components/workout/AnimatedNumber.tsx` | New — reusable count-up component with bounce |
| `src/components/workout/ConfettiBurst.tsx` | New — canvas-based gold confetti, fires once |
| `src/index.css` | Add `@keyframes` for shimmer, bounce-land, trophy-burst, glow-pulse, stagger-fade-in |

No external dependencies. Pure CSS + `requestAnimationFrame` + canvas. Lightweight and performant on mobile Safari.

