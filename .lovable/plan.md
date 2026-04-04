

## Community Link Previews — Implementation Plan

### What We're Building
Add clickable links and rich link preview cards to community posts, matching the existing messaging behavior:
- URLs in post content become clickable (sky-blue, underlined)
- If a post contains exactly one URL, fetch and display a link preview card (title, description, image, hostname)
- If multiple URLs exist, all are clickable but no preview card is shown
- YouTube links show the video thumbnail preview card

### Approach
Reuse the existing `LinkPreviewCard` component and `fetch-link-preview` edge function. No new database columns or tables needed — previews will be fetched client-side on render and cached via React Query.

### Step 1: Create `CommunityPostContent` Component
**New file:** `src/components/community/CommunityPostContent.tsx`

- Reuses the same URL regex and link rendering logic from `MessageContent.tsx`
- Extracts URLs from post content, makes them clickable
- If exactly one URL is found, calls `fetch-link-preview` edge function and renders `LinkPreviewCard`
- Uses React Query with a long `staleTime` (30 min) keyed by URL to avoid redundant fetches
- Handles loading state with a subtle skeleton for the preview card

### Step 2: Update `PostCard.tsx`
Replace the plain `<p>` content render (line 136) with the new `<CommunityPostContent>` component:
```
// Before
<p className="text-sm ...">{post.content}</p>

// After
<CommunityPostContent content={post.content} />
```

No other files change. The `LinkPreviewCard` and `fetch-link-preview` edge function are already deployed and work as-is.

### Files Created
- `src/components/community/CommunityPostContent.tsx`

### Files Modified
- `src/components/community/PostCard.tsx` (swap content renderer)

### No Database Changes Required
Link previews are fetched on-the-fly and cached in React Query memory. No new columns or migrations needed.

