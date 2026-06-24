# Workout Tracker — Apple-native font pass

Make only the active workout session screen feel like Strong / iOS. Nothing else in the app changes.

## What changes visually

- New display font: **Geist** for labels, exercise titles, headers
- New numeric font: **Geist Mono**, weight 800, tabular — for weights, reps, set numbers, the rest timer
- Tighter letter-spacing on headers (`-0.02em`) to match SF Pro feel
- Existing dark theme + gold accents stay exactly as-is — this is type only, no color / layout changes

## Scope (files touched)

1. `tailwind.config.ts` — add a `workout` font family (Geist + system fallback) and `workout-mono` (Geist Mono)
2. `src/main.tsx` — import `@fontsource-variable/geist` and `@fontsource-variable/geist-mono`
3. `src/components/WorkoutLogger.tsx` — wrap the session container in `font-workout` + tracking-tight so the whole tracker inherits Geist
4. `src/components/workout/ExerciseCard.tsx` — bump the weight/reps/set-number inputs to `font-workout-mono font-extrabold tabular-nums`, slightly larger; exercise title gets `font-workout font-bold tracking-tight`
5. `src/components/workout/InlineRestTimer.tsx` — timer numerals → `font-workout-mono font-extrabold tabular-nums`

## What stays untouched

- Dashboard, nutrition, messaging, calendar, coach views — still Space Grotesk + Inter
- All colors, spacing, layout, animations, business logic in the workout tracker
- Workout summary / history screens (only the live session view gets the new type)

## Install

`bun add @fontsource-variable/geist @fontsource-variable/geist-mono`

## Risk

Very low — purely additive font files + class swaps inside two workout components. No data, no behavior, no layout shifts beyond minor optical weight change on numerals.
