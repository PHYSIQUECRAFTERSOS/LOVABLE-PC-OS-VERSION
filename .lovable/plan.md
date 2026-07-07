## Goal
Restore profile photos so they display like they did before the avatar image-transform regression, especially in Messages, Community, and Command Center.

## Confirmed cause
- The shared `UserAvatar` still sends avatar URLs through the rendered image endpoint with `width=64&quality=70`.
- In the live preview, those rendered URLs are producing avatar images with dimensions like `64x512`.
- Those tall transformed images are then displayed inside a square circular avatar with `object-cover`, which crops a tiny center slice and makes faces/photos look super zoomed in.
- Several adjacent avatar surfaces also bypass `UserAvatar` and use raw `AvatarImage` or `<img>` directly, so the fix should centralize safe avatar behavior instead of patching one screen at a time.

## Minimal implementation plan
1. Update `src/components/profile/UserAvatar.tsx`
   - Stop using the transformed/rendered image URL for profile avatars.
   - Use the stored raw avatar URL directly, matching the previous behavior.
   - Keep `object-cover`, lazy loading, async decoding, fallback initials, and the existing `size` prop API so call sites do not break.
   - Keep the stored original files and upload path untouched.

2. Harden the shared avatar primitive in `src/components/ui/avatar.tsx`
   - Add `object-cover` to the base `AvatarImage` class.
   - This protects direct `AvatarImage` usages in leaderboards, client lists, check-ins, team/client detail views, and other places that do not yet use `UserAvatar`.
   - This is a presentation-only CSS fix; no data, upload, or backend behavior changes.

3. Normalize obvious bypasses in the requested surfaces only
   - Community: replace the direct leaderboard/avatar quick-access render paths with `UserAvatar` where appropriate, or ensure their `AvatarImage`/`img` uses the same raw URL + `object-cover` behavior.
   - Messages: verify `CoachThreadList` and `ThreadChatView` use the corrected `UserAvatar` path.
   - Command Center: verify all client rows already route through `UserAvatar` after the central fix.

4. Verification after implementation
   - Use Playwright on `/messages`, `/community`, and `/dashboard` with the injected session.
   - Inspect rendered avatar image CSS and image dimensions.
   - Confirm avatar URLs are no longer `/storage/v1/render/image/public/...width=64...` for `UserAvatar` surfaces.
   - Confirm visible screenshots show profile photos no longer super zoomed in.

## Explicit non-goals
- Do not touch `CacheBuster`.
- Do not modify uploads, stored original avatar files, compression, storage paths, auth, backend policies, or dashboard snapshot/cache work.
- Do not add native plugins or require a native rebuild.