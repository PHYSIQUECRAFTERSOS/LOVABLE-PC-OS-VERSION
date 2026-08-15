# Rumble video support (exercises, recipes, courses)

Add Rumble as a second video provider everywhere YouTube works today. You paste a normal Rumble page link (e.g. `https://rumble.com/v7e7m34-chest-supported-t-bar-row-lat-focus.html`) and the app resolves the playable embed and thumbnail automatically, then plays it inline exactly like YouTube.

## What you'll see

- **Add/Edit Exercise** (Master Libraries and the coach exercise modals): the Video Source row gets a third option — YouTube / Rumble / Upload. Paste the Rumble page link, the thumbnail preview appears right away.
- **Client workout player + coach previews**: the exercise video plays inline in the same card/modal, with the Rumble thumbnail on the exercise tiles and workout cards.
- **PC Recipes**: recipe editor accepts a Rumble link alongside YouTube; recipe detail plays it inline.
- **Courses**: New/Edit Video dialog accepts a Rumble link; course cards show the Rumble thumbnail and the player sheet plays it.

If a link can't be resolved (bad URL, private video), you get an inline error at save time rather than a broken tile later.

## How it works

A Rumble page URL is not directly embeddable — the embed uses a different ID (`rumble.com/embed/v7c16z8/`). So on save the app resolves the page link once through Rumble's oEmbed API and stores the resolved embed URL plus the thumbnail. Playback is then a plain iframe with no runtime lookup, so it's as fast as YouTube today.

## Technical details

1. **New edge function `resolve-video-link`**
   - Input: any pasted video URL. For Rumble, calls `https://rumble.com/api/Media/oembed.json?url=<page url>`, parses the returned iframe `src` and `thumbnail_url`.
   - Returns `{ provider, embedUrl, thumbnailUrl, title }`. Server-side to avoid CORS and keep parsing in one place.

2. **New shared util `src/utils/videoEmbed.ts`**
   - `detectVideoProvider(url)` → `youtube | rumble | file | null`.
   - `getVideoEmbedUrl(url, opts)` → YouTube keeps the existing `youtube.com/embed/<id>` build; Rumble returns the stored `rumble.com/embed/<id>/` URL with `autoplay`/`playsinline` params.
   - `getVideoThumbnail(url, storedThumb)` → YouTube derives `img.youtube.com/...`; Rumble uses the stored thumbnail.

3. **Storage — no schema change**
   - `exercises.youtube_url` stores the resolved Rumble embed URL, `exercises.youtube_thumbnail` the Rumble thumbnail. Same for `pc_recipes.youtube_url` and the courses video fields (course `youtube_video_id` stays empty for Rumble; thumbnail/embed come from the stored URL).
   - Existing YouTube rows are untouched; all read paths already pass these fields through.

4. **Call sites switched to the shared util** (replacing the ~8 copies of the YouTube regex):
   - `src/components/libraries/AddExerciseModal.tsx`, `ExercisePreviewModal.tsx`, `src/components/libraries/ExerciseLibrary.tsx`
   - `src/components/training/AddCustomExerciseModal.tsx`, `WorkoutPreviewModal.tsx`, `ExerciseLibrary.tsx`, `MobileExercisePickerSheet.tsx`
   - `src/components/workout/ExerciseCard.tsx` (client playback), `src/lib/workoutMeta.ts` (thumbnails)
   - `src/components/nutrition/PCRecipeEditor.tsx`, `PCRecipeDetail.tsx`
   - `src/components/courses/NewCourseDialog.tsx`, `CourseCard.tsx`, `CoursePlayerSheet.tsx`

5. **Validation**: editors validate the pasted link, show a spinner while resolving, block save on failure, and render a live thumbnail preview on success.
