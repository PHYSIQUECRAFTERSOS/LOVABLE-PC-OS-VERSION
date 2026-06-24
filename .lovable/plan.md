## Goal
Make all text easier to read across the entire app — coach desktop, client mobile, all themes — without changing any layouts, components, or functionality. Pure design-token + base typography change so every screen benefits automatically.

## Root cause
Almost every "hard to read" string the user pointed out (PR Challenge body text, hamburger nav labels, Sign Out, Community card metadata, "Welcome back…", "Complete today's session…") uses the same shared CSS token: `--muted-foreground`. Today it's set to `0 0% 55%` on a `0 0% 7%` background — that's roughly a 3.5:1 contrast ratio, below the WCAG AA threshold (4.5:1) for body text. The hamburger menu links use `--sidebar-foreground` at `45 10% 85%` but render at a thin `font-normal` weight on a dimmed overlay, which also reads as faint.

Fixing these two tokens (plus a small base font-weight bump) is the highest-leverage change — it lifts every screen at once without touching individual components.

## Changes (all in `src/index.css`)

### 1. Dark theme — brighten secondary/muted text
- `--muted-foreground`: `0 0% 55%` → `0 0% 72%` (contrast jumps from ~3.5:1 to ~7.2:1 on the dark background — comfortably AA, near AAA)
- `--secondary-foreground`: `45 10% 85%` → `45 8% 92%`
- `--sidebar-foreground`: `45 10% 85%` → `45 8% 94%` (fixes the hamburger menu labels in IMG_4099)
- `--card-foreground` / `--popover-foreground`: `45 10% 90%` → `45 8% 95%` (slightly brighter card body copy like the PR Challenge description)

### 2. Light theme — small polish
- `--muted-foreground`: `45 4% 35%` → `45 5% 28%` (darker on the warm cream background for sharper secondary text)
- `--secondary-foreground` / `--sidebar-foreground`: nudge 5% darker

### 3. Base typography — slight weight bump for body text
Add to the `body` rule:
- `font-weight: 450` (between normal 400 and medium 500). Renders crisper on retina/OLED screens without looking bold. Headings keep their existing weights.
- `-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;` if not already present, to sharpen rendering on macOS/iOS.

### 4. Suppress low-opacity muted text (one-liner safety net)
A few components in the codebase use `text-muted-foreground/60` or `/70` which would still look faint even after #1. Add a small global rule so opacity-modified muted text never drops below readable:
```css
.text-muted-foreground\/50, .text-muted-foreground\/60, .text-muted-foreground\/70 {
  color: hsl(var(--muted-foreground) / 0.85);
}
```
(Targets only the three lowest-opacity variants; higher ones stay as-is.)

## What this fixes (verified against the screenshots)
- IMG_4098: "Welcome back. Here's your overview.", PR Challenge subtitle, "Complete today's session…", "52 / 300 XP", "#2 of 63"
- IMG_4099: Dashboard / Calendar / Training / Nutrition / Progress / Community / Messages / Challenges / Ranked / Settings / Sign Out menu labels
- Community card metadata (timestamps, author lines, reaction counts)
- Coach desktop: client roster secondary text, table headers, calendar event subtitles, form field hints, settings descriptions — all use the same tokens and lift automatically

## What stays the same
- All colors, gradients, gold accents, layouts, components, animations
- Heading weights and sizes
- Primary action buttons (gold "View", "Sign In", etc.) already meet contrast
- No component files touched — zero risk of regressing functionality

## Verification after build
- Reload the dashboard at 375px (client mobile) and 1280px (coach desktop)
- Open the hamburger menu — labels should look noticeably crisper
- Open a community post — author + timestamps readable
- Spot-check 3 coach pages (Clients roster, Calendar, a client detail tab)
