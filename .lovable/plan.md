

# Fix: White Space at Top/Bottom on iPhone After Navigation

## Root Cause

The white flash occurs because of iOS overscroll bounce (rubber-banding) during/after navigation. When the user navigates between routes:

1. **`body` and `#root` allow overflow** — `body` has no `overflow: hidden`, and `#root` uses `min-height: 100dvh` (not fixed height). During route transitions, content can momentarily be shorter than the viewport, allowing iOS to rubber-band and reveal the underlying system background (white/light).
2. **Scroll position inheritance** — When navigating, the previous page's scroll position can cause the body to be in a scrolled state briefly, exposing gaps at top/bottom before the new `fixed inset-0` AppLayout mounts.

## Fix (2 files)

### 1. `src/index.css` — Lock `body` and `#root` to prevent overscroll

```css
body {
  /* existing styles... */
  height: 100%;
  height: 100dvh;
  overflow: hidden;          /* ← prevents body-level rubber-band */
}

#root {
  height: 100%;
  height: 100dvh;            /* ← fixed height, not min-height */
  overflow: hidden;           /* ← no scroll at root level */
  background-color: hsl(0 0% 7%);
  position: relative;
}
```

Change `min-height` → `height` on both `body` and `#root`, and add `overflow: hidden` to both. All scrolling is already handled inside `AppLayout`'s `<main>` with `overflow-y-auto`, so the outer containers should never scroll.

### 2. `index.html` — Match `theme-color` to actual background

The `theme-color` is `#121212` but the actual CSS background is `hsl(0 0% 7%)` which is `#121212` — actually these match. However, adding a `background-color` directly on `<html>` tag style attribute ensures the color is applied before CSS loads:

```html
<html lang="en" class="dark" style="background-color:#121212">
```

And on `<body>`:
```html
<body style="background-color:#121212">
```

This ensures the dark background is painted immediately, even before Tailwind/CSS loads, eliminating any flash during navigation transitions.

## Why This Works

- `overflow: hidden` on `body`/`#root` prevents iOS rubber-band overscroll from revealing white space behind the app
- Fixed `height: 100dvh` instead of `min-height` prevents the container from ever being taller than the viewport (which can trigger scroll)
- Inline `style` on `<html>` and `<body>` ensures the background is dark from the first paint, before any CSS file loads
- All actual content scrolling happens inside `AppLayout`'s `<main className="flex-1 overflow-y-auto">`, which is properly contained

## Files Changed
1. `src/index.css` — `body` and `#root` rules (change min-height → height, add overflow: hidden)
2. `index.html` — Inline background-color on `<html>` and `<body>` tags

