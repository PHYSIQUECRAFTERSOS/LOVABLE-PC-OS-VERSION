# Courses Section (Skool-style YouTube library)

A dedicated area where you and Aaron can post YouTube recordings of your weekly Zoom group calls, organized into modules with tags and pinning, so clients can easily browse and rewatch past trainings.

## Navigation

- New nav entry **Courses** (BookOpen icon) added to the client hamburger menu directly under **Community**.
- Also added to the coach hamburger menu under Community (so you and Aaron can manage from the same place).
- Not added to the mobile bottom tab bar (keeps the pinned nav stable per the layout stability rule).

## Page: `/courses`

Layout (mobile-first, matte black + gold aesthetic):

1. **Header** — "Courses" title, search bar, and (coach only) a **+ New Video** button.
2. **Filter row** — horizontal scrollable chips: `All`, then each Module (Nutrition, Training, Mindset, etc.), plus a "Pinned" toggle.
3. **Pinned strip** — up to ~3 featured cards at the top when the "All" filter is selected.
4. **Chronological grid** — newest first. Card shows: YouTube thumbnail, title, module chip, duration, posted date, small "Watched" checkmark badge in the corner once viewed.
5. Empty and loading skeletons follow existing patterns.

## Video Detail / Player

- Tapping a card opens a full-screen sheet on mobile / centered dialog on desktop.
- **Embedded YouTube iframe player** at the top (16:9, respects safe areas).
- Below: title, module + tags, posted date, duration, description/show notes (whitespace-pre-wrap so line breaks are preserved), and an **Open in YouTube** button.
- Watching auto-marks the video as watched for that client (after ~10s of play or on close).

## Coach Management

- **+ New Video** dialog: paste YouTube URL → auto-fetches thumbnail, title, and duration via the oEmbed endpoint (client-side, no key). Coach can override title, pick a Module, add tags, description, toggle Pinned, and set the posted date (defaults to today).
- Edit and delete via a "…" menu on each card (coach/admin only). Admin can delete anything; coaches can edit/delete their own.
- Modules are managed by admin from the same page (small "Manage Modules" link in the header for admin only).

## Suggested Improvements Included

- **Watched indicator per client** so clients can see what they've missed.
- **Search bar** covers title, description, and tags — makes finding "that macro talk from 2 months ago" trivial.
- **Pinned strip** so you can spotlight onboarding-worthy calls (e.g., "Start Here").
- **Community cross-post button** (optional, coach-only) — after adding a video, one tap creates a community post linking to it, so you can stop double-posting manually.
- **"New this week" badge** on cards posted in the last 7 days for a small dopamine hit.

## Data Model (technical)

Three new tables under Lovable Cloud, all with RLS + GRANTs per project standards:

- `course_modules` — id, name, sort_order, created_by, timestamps. Read: all authenticated. Write: coach/admin.
- `courses` — id, title, youtube_url, youtube_video_id, thumbnail_url, duration_seconds, description, module_id (FK), tags (text[]), is_pinned, posted_at, created_by, timestamps. Read: all authenticated. Insert/Update: coach/admin (creator or admin can edit/delete). Delete: admin or creator.
- `course_watches` — id, course_id, user_id, watched_at. Read/Write: own rows only. Unique on (course_id, user_id).

Seed with a few starter modules: Nutrition, Training, Mindset, Q&A, Start Here.

## Files (technical)

- New page `src/pages/Courses.tsx`.
- New components under `src/components/courses/`: `CourseCard.tsx`, `CoursePlayerSheet.tsx`, `NewCourseDialog.tsx`, `ModuleFilterChips.tsx`, `ManageModulesDialog.tsx`.
- New hook `src/hooks/useCourses.ts` (list + mutations, cached via existing useDataFetch pattern with a short TTL).
- Route registered in `src/App.tsx` (`/courses`, ProtectedRoute — all roles).
- Nav entry added to `src/components/AppLayout.tsx` in both `clientNav` and `coachNav`, positioned directly after the Community entry.
- Small util `src/utils/youtube.ts` for parsing video IDs and calling YouTube's public oEmbed endpoint.

## Out of Scope

- No native video hosting or uploads — YouTube links only.
- No comments/likes inside Courses (Community already handles discussion).
- No progress %/scrubbing analytics beyond a single "watched" flag.
