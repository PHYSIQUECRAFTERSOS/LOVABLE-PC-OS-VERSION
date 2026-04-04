

## Add Compare Mode to Coach-Side Progress Photos

### Problem
The client-side `ProgressPhotosModal` already has a full compare flow (tap Compare → select BEFORE → select AFTER → side-by-side view with days apart). The coach-side `ProgressTab.tsx` only has a basic lightbox with no compare capability.

### Solution
Replace the custom lightbox in `ProgressTab.tsx` with the existing `ProgressPhotosModal` component, which already supports everything needed: grid view, angle filters, single-photo viewer, and the full compare flow. This avoids duplicating code.

### Changes

**File: `src/components/clients/workspace/ProgressTab.tsx`**

1. Import `ProgressPhotosModal` from `@/components/dashboard/ProgressPhotosModal`
2. Add state: `const [photosModalOpen, setPhotosModalOpen] = useState(false)`
3. Add a "View All" / "Compare" button next to the Progress Photos card title that opens the modal
4. Remove the entire custom lightbox block (the `lightboxIndex !== null` section at lines ~225-267) since the modal handles single-photo viewing and comparison
5. Keep the inline 3-column grid as a preview — tapping any photo opens the `ProgressPhotosModal` instead of the old lightbox
6. Render `<ProgressPhotosModal open={photosModalOpen} onClose={() => setPhotosModalOpen(false)} clientId={clientId} />` at the bottom of the component

The `ProgressPhotosModal` already:
- Fetches photos by `clientId` with signed URLs
- Has angle filter chips (All/Front/Side/Back/Other)
- Has the Compare FAB → tap BEFORE → tap AFTER → side-by-side with "X days apart"
- Has single-photo full-screen viewer with prev/next navigation
- Accepts an optional `clientName` prop for the header

### What stays the same
- Stats cards (photo count, measurements count)
- Measurements toggle switch
- Recent Measurements list
- The inline 3-column photo preview grid (kept as a quick glance)
- All data fetching for measurements

