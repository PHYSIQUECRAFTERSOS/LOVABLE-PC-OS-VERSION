

## Diagnosis

Your TestFlight white screen is caused by **two compounding issues**:

### Issue 1: Duplicate React Instance (Runtime Crash)
The active runtime error `TypeError: null is not an object (evaluating 'dispatcher.useRef')` means React hooks are failing at the very first component (`TooltipProvider` in `App.tsx`). This is a classic "two copies of React loaded" problem. The `dedupe` config was added to `vite.config.ts` but the error persists — this means the bundler dedup alone isn't sufficient and we need to also ensure a single React copy at the module resolution level.

### Issue 2: Publishing Gap
Your `capacitor.config.ts` points to `https://app.physiquecrafters.com?v=10` — the **published** URL. TestFlight loads whatever version is currently published. If you publish code that has the dual-React crash, TestFlight gets a white screen. The fix must land in code, then be **published** before TestFlight will show the corrected version.

### Why the live site appears to work in a browser
When I fetched `app.physiquecrafters.com`, the sign-in page renders. This may be because the currently published version is older (pre-crash), or because the crash only triggers under certain conditions (authenticated routes, WKWebView environment). Either way, the runtime error is real and must be fixed.

---

## Plan

### Step 1: Fix the duplicate React crash
**File: `vite.config.ts`**
- The current `dedupe: ["react", "react-dom"]` is necessary but not sufficient. We need to also add explicit `alias` entries that force all imports of `react` and `react-dom` to resolve to the exact same file, preventing any library from pulling in a second copy.

```typescript
resolve: {
  alias: {
    "@": path.resolve(__dirname, "./src"),
    "react": path.resolve(__dirname, "node_modules/react"),
    "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
  },
  dedupe: ["react", "react-dom"],
},
```

### Step 2: Bump cache-buster to v=11
**File: `capacitor.config.ts`**
- Change `?v=10` to `?v=11` so WKWebView is forced to fetch the fresh build after publishing.

### Step 3: Add no-cache headers hint in index.html
**File: `index.html`**
- Add a `<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">` tag in the `<head>` to discourage WKWebView from aggressively caching the HTML shell.

---

## After Implementation (Your Steps)

1. **Publish** the latest version from Lovable (this deploys to `app.physiquecrafters.com`)
2. On your Mac, `git pull` the latest code
3. Run `npm install` (in case lockfile changed)
4. Run `npx cap sync ios`
5. Open Xcode, **confirm** no `CAPBridgeViewControllerExtension.swift` or URLCache lines exist
6. Clean build (Product → Clean Build Folder)
7. Archive and upload to TestFlight

### Technical Details

The `dispatcher.useRef is null` error occurs when a Radix UI component (like `TooltipProvider`) imports React from a different module instance than the one `createRoot` used. By aliasing `react` and `react-dom` to absolute paths in the project's own `node_modules`, every library resolves to the same singleton — eliminating the crash.

The cache-busting `?v=11` parameter forces WKWebView to treat the URL as new, bypassing any disk cache from previous builds. The meta cache-control tag provides an additional signal to the WebView not to cache the HTML document.

