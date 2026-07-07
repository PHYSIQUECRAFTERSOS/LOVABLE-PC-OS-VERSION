## Step 1 — Investigation

**Transform URL params today** (`src/lib/supabaseImage.ts`):
- list: `?width=64&quality=70&resize=cover`
- detail: `?width=256&quality=70&resize=cover`
- No `height` param is passed.

**UserAvatar markup** (`src/components/profile/UserAvatar.tsx`):
- Uses shadcn `Avatar` / `AvatarImage` (Radix). No explicit `<img>` width/height attributes.
- `AvatarImage` gets `className="object-cover"`, `loading="lazy"`, `decoding="async"`.
- The Radix `AvatarImage` base classes are `aspect-square h-full w-full`, so the container is always a **square circle**; sizing is driven by the parent `className` (e.g. `h-7 w-7`, `h-9 w-9`).
- No consumer passes a `size` prop; every call site (`CoachCommandCenter`, `CheckinSubmissionDashboard`, `CommunityPostCard`, `ThreadChatView`, `MessagesPopup`, etc.) only overrides pixel size via `className`. So every avatar currently requests the `list` (64px) transform, including places rendered at 36–56px which is fine.

**Stored originals:** Uploaded via `AvatarUpload.tsx` / `OnboardingProfilePhoto.tsx`, which compress but do **not** force a square crop, so originals vary in aspect ratio (portrait selfies are common). This is the trigger.

**Root cause:** Supabase's image transform, when given `resize=cover` with only a `width` (no `height`), treats it as a square target (`width × width`) and returns a **hard-cropped square** of the original. For portrait avatars, that produces the "zoomed-in / cut off" look users are seeing. Before the change, the raw original was fed into the same square `Avatar` container and CSS `object-cover` cropped it symmetrically at display size — visually a much gentler crop than a 64×64 server-side square crop of a tall photo. So the transform is over-cropping before the browser ever sees it.

The CSS side (`object-cover` inside a circular square container) is correct and matches the "normal profile picture" behavior. The fix belongs in the transform, not the markup.

## Step 2 — Fix (minimal)

Edit only `src/lib/supabaseImage.ts` and `src/components/profile/UserAvatar.tsx`. No call site changes, no upload path changes, no revert of the transform.

1. **`src/lib/supabaseImage.ts`** — when only `width` is provided (no `height`), do **not** send `resize`. This makes Supabase scale proportionally to the requested width, preserving aspect ratio. Only attach `resize` when both dimensions are explicitly supplied. Keep `quality` default 70 and pass-through behavior for non-Supabase URLs.

2. **`src/components/profile/UserAvatar.tsx`** — stop forcing `resize: "cover"`. Call `transformSupabaseImage(src, { width, quality: 70 })` so the server returns a width-scaled, aspect-correct image. Keep `object-cover`, `loading="lazy"`, `decoding="async"`, the `onError` raw-URL fallback, and the `size` prop. The circular container + CSS `object-cover` will handle centered cropping at display size, exactly like a normal profile picture.

Result: server delivers a small, aspect-preserved image (still ~90% lighter than the original at list sizes); the browser center-crops it into the circle via CSS. Subjects render fully and undistorted across Community, Messages, Command Center, Weekly Check-In, New Clients, client lists, and detail views. Both coach and client avatars benefit — no consumer changes required.

3. **Fallback:** Keep the existing `onError → raw URL` path already in `UserAvatar`. No need to hard-fall-back preemptively; the transform will now render correctly.

## Out of scope (untouched)
- `AvatarUpload.tsx`, `OnboardingProfilePhoto.tsx`, storage originals.
- Dashboard resilience, ProgressWidgetGrid caching, dashboard snapshot, CacheBuster, `useDataFetch`, Web Vitals.
- RLS, indexes, schema, `getDisplayPosition()`, `calendar_events` rule, en-CA formatting.

## Files changed
- `src/lib/supabaseImage.ts` (conditional `resize` param)
- `src/components/profile/UserAvatar.tsx` (drop `resize: "cover"` argument)

## Post-fix report will include
- Confirmed cause (server-side square cover-crop from `resize=cover` + width-only).
- Exact param and argument changes with line numbers.
- Visual confirmation across the listed surfaces for coach and client avatars.
- Confirmation the transform is retained (no raw-URL fallback needed).
