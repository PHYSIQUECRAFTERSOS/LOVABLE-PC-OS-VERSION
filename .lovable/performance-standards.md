# Physique Crafters — Performance Standards

These rules are **mandatory** for every feature, route, and component.

## The 3-5-10 Rule

| Limit | Max Duration | Action on Exceed |
|-------|-------------|-----------------|
| Spinner | 3 seconds | Auto-transition to error/retry |
| Upload / Standard API | 5 seconds | Abort + show error + retry |
| AI Processing | 10 seconds | Abort + show error + retry |

Infinite loaders are **forbidden**.

## Perceived Load

- Every route renders visible UI in **< 1 second**
- Skeleton loaders shown **immediately**
- Never block initial paint waiting for API
- Use `useDataFetch` hook with built-in caching + timeout

## Network Calls

- All async, non-blocking
- Partial UI renders before data arrives
- Use stale-while-revalidate pattern

## Image Handling

All uploads must:
- Compress client-side via `compressImage()` from `src/lib/performance.ts`
- Max 800px width (512px for avatars)
- Max 300KB file size
- JPEG or WebP format
- Strip metadata
- **Never** upload raw phone images

## Caching

Cache locally (in-memory via `useDataFetch`):
- Current workout block
- Current week calendar
- Recently scanned foods
- User profile data

Refetch only when: data expired, user refreshes, or coach updates.

## Payloads

- Paginate large datasets
- Only fetch data for current screen
- No full-table returns

## Error Handling

Every feature must:
- Log failure point to console
- Show clear error state
- Offer retry
- Never dead-end

## Utilities

| Utility | Location | Purpose |
|---------|----------|---------|
| `useDataFetch` | `src/hooks/useDataFetch.ts` | Cached, timed, non-blocking data fetching |
| `compressImage` | `src/lib/performance.ts` | Client-side image compression |
| `fetchWithTimeout` | `src/lib/performance.ts` | Promise wrapper with abort timeout |
| `TIMEOUTS` | `src/lib/performance.ts` | Standard timeout constants |
| `DataSkeleton` | `src/components/ui/data-skeleton.tsx` | Skeleton loader components |

## Feature Checklist

Before any feature ships:
- [ ] Under 1s initial render
- [ ] No spinner beyond 3s
- [ ] API timeout implemented
- [ ] Payload optimized
- [ ] Caching implemented
- [ ] Error state visible
- [ ] Works on mobile Safari
- [ ] No console errors
