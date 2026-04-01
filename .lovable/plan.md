
Goal: correct the native iOS StoreKit error-scope misunderstanding and then safely finish the broader fixes for Health sync, subscriptions, and the Add Food overlay without touching unrelated features.

What I found
- The screenshot error is real: `Cannot find 'StoreError' in scope` in both `StoreKitPlugin.swift` and `storekitmanager.swift`.
- In the version-controlled repo, `ios-plugin/StoreKitPlugin.swift` defines `enum StoreError`, but `storekitmanager.swift` does not exist there.
- In your uploaded Xcode files, `storekitmanager.swift` uses `StoreError.failedVerification` but does not define the enum either.
- That means deleting the enum from `StoreKitPlugin.swift` was not sufficient in your current native project state. Right now, neither file owns the shared error type.

Why this happened
- Your Xcode project has drifted from the repo/native plugin folder.
- The previous assumption was “`storekitmanager.swift` already defines `StoreError`.” Your uploaded files show that is false in the current TestFlight/native code.
- So the fix is not “delete the enum and stop.” The fix is to give both files a valid error type in one consistent place.

Recommended native fix in Xcode
1. Keep a single shared error definition.
2. Put it in `storekitmanager.swift` near the top:
```swift
enum StoreError: Error {
    case failedVerification
}
```
3. Remove the duplicate enum from `StoreKitPlugin.swift` if it still exists there.
4. Clean build folder and rebuild.
5. Confirm both files compile with only one `StoreError` definition in the target.

Safer alternative
- If you want to avoid cross-file coupling, rename each helper error locally instead:
  - `StoreKitPlugin.swift` → `StoreKitPluginError`
  - `storekitmanager.swift` → `StoreKitManagerError`
- Then update each `throw` line to use its local enum.
- This is slightly more verbose but avoids future duplicate-symbol confusion.

Implementation plan for the full app fix
1. Native StoreKit stabilization
- Reconcile Xcode-native files against repo plugin files.
- Ensure exactly one valid verification error type exists.
- Verify product IDs remain:
  - `com.physiquecrafters.app.monthly`
  - `com.physiquecrafters.app.biweekly`
- Ensure `StoreKitPlugin` and `storekitmanager.swift` do not compete with inconsistent product lists or verification helpers.

2. Subscription web/native bridge fix
- Keep the `Subscribe.tsx` improvement that validates loaded product IDs using the return value from `fetchProducts()`, not stale React state.
- Do not change paywall copy, pricing text, or plan UI.

3. Health sync recovery
- Keep health sync scoped to the existing 2-hour cadence.
- Add the limited retry on initial auto-sync so temporary native bridge startup issues do not immediately surface as “Health sync temporarily failed.”
- Preserve one-tap manual sync from “Sync All Devices.”

4. Add Food overlay fix
- Keep changes isolated to `src/components/nutrition/AddFoodScreen.tsx`.
- Remove fragile iOS keyboard viewport pinning logic that leaves the overlay shifted after dismiss.
- Use the existing fixed overlay structure and only reset scroll/repaint on keyboard close so bottom navigation remains visible/clickable.

Files involved
- Native/Xcode:
  - `StoreKitPlugin.swift`
  - `storekitmanager.swift`
  - possibly `AppDelegate.swift` only for verification, not necessarily changes
- Repo/web:
  - `src/pages/Subscribe.tsx`
  - `src/hooks/useHealthSync.ts`
  - `src/components/nutrition/AddFoodScreen.tsx`

Important note
- Before any further TestFlight build, the native Xcode files need to be treated as the source of truth for StoreKit compilation. Right now the repo and Xcode project are out of sync, so I would first align them and then proceed with the scoped web fixes.
