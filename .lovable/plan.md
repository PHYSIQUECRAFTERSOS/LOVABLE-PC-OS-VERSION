

# Plan: Replace Settings Tab with Messages + Replace Compliance Section with Community Hub

## Changes

### 1. Client bottom nav: Settings → Messages
**File: `src/components/AppLayout.tsx`**

Replace the last item in the client `mobileBottomItems` array (line 107):
- Remove `{ to: "/profile", icon: Settings, label: "Settings" }`
- Add `{ to: "/messages", icon: MessageSquare, label: "Messages" }`

Settings remains accessible via the gear icon in the mobile header (line 176-181) and the hamburger slide-out menu (line 91 in `clientNav`).

### 2. Replace Week Score + 30-Day Compliance with Community Hub
**File: `src/pages/Dashboard.tsx`**

Remove lines 103-107 (the `WeeklyMomentumScore` + `ComplianceMomentum` section).

Replace with a new `<CommunityQuickAccess />` component that:
- Shows a "Community" card header with a "View All" link to `/community`
- Fetches the 3 most recent community posts from `community_posts` (ordered by `created_at desc`)
- Displays each post as a compact row: author name, post snippet (truncated), like count, comment count
- If no posts exist, shows an empty state: "No posts yet — be the first to share"
- Tapping a post navigates to `/community`

### 3. New component: `CommunityQuickAccess`
**File: `src/components/dashboard/CommunityQuickAccess.tsx`** (new)

- Queries `community_posts` (limit 3, ordered by `created_at desc`, not deleted)
- Joins with `profiles` to get author name
- Renders inside a `Card` with gold accent header
- Each post row shows: author avatar initials, truncated content (2 lines), engagement counts (likes/comments from `like_count`/`comment_count` columns or sub-queries)
- "View All →" button navigates to `/community`

## Files to modify
- `src/components/AppLayout.tsx` — swap Settings for Messages in client bottom nav
- `src/pages/Dashboard.tsx` — replace compliance section with CommunityQuickAccess
- `src/components/dashboard/CommunityQuickAccess.tsx` — new component

