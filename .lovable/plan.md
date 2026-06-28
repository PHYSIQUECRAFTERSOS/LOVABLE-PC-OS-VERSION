## Goal
Let clients tap a clear YouTube-style play button on any exercise inside the workout preview (both from Dashboard/Calendar and from the Training tab in their profile) to watch the exercise demo video before starting the workout.

## Current state
- **Dashboard / Calendar** flow uses `src/components/dashboard/WorkoutStartPopup.tsx`, which already shows a per-exercise video button — but the icon is a small gray `HelpCircle` ("?"), which clients don't recognize as "watch video" (screenshot 1).
- **Client profile → Training tab** uses `src/components/training/WorkoutPreviewModal.tsx` (screenshot 2). It already loads each exercise's `youtube_url` / `video_url` but does **not** expose any way to play the video before starting the workout.

## Changes

### 1. `src/components/training/WorkoutPreviewModal.tsx`
- Add a `videoUrl` state + a small `Dialog` with a YouTube iframe (same pattern as `WorkoutStartPopup`, including a `getYouTubeId()` helper).
- On each exercise row, when `youtube_url` or `video_url` exists, render a tappable YouTube-style play button on the right side of the row that opens the video.
- Also make the exercise thumbnail tappable to open the same video (so the existing thumbnail becomes an obvious affordance, with a small play overlay on hover/always for clarity).

### 2. `src/components/dashboard/WorkoutStartPopup.tsx`
- Replace the `HelpCircle` icon button with the same YouTube-style play button so the UI is consistent and obviously means "watch video".

### 3. New shared icon (inline, no new file)
Use a small rounded red badge (`bg-red-600`) with a white `Play` triangle (Lucide `Play`, `fill-white`), sized ~28px — visually reads as the standard YouTube play button while staying within the existing Lucide-only constraint.

## Out of scope
- No DB / RLS / data-fetch changes (videos already load with the exercise).
- No changes to the in-workout logging screen (that already has per-exercise video).
- No new routes or pages.

## Verification
- Open client profile → Training → tap a workout: each exercise with a video shows the red play button; tapping it opens the YouTube iframe.
- Open Dashboard "Start workout" popup: same red play button replaces the `?` icon, behavior unchanged.
- Exercises with no video do not render the button.
