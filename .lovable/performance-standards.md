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
| `useDataFetch` | `src/hooks/useDataFetch.ts` | Cached, timed, non-blocking data fetching with perf logging |
| `useTimedLoader` | `src/hooks/useTimedLoader.ts` | Tiered loading phases: loading → slow → failed |
| `useOptimistic` | `src/hooks/useOptimistic.ts` | Optimistic UI updates with auto-rollback |
| `TimedLoader` | `src/components/ui/timed-loader.tsx` | Standard loading UI enforcing no-spinner policy |
| `compressImage` | `src/lib/performance.ts` | Client-side image compression |
| `fetchWithTimeout` | `src/lib/performance.ts` | Promise wrapper with abort timeout |
| `withTimeout` | `src/lib/performance.ts` | Generic async guard — wraps any promise with hard timeout |
| `TIMEOUTS` | `src/lib/performance.ts` | Standard timeout constants |
| `DataSkeleton` | `src/components/ui/data-skeleton.tsx` | Skeleton loader components |
| `getPerfLog` | `src/hooks/useDataFetch.ts` | Access raw performance log entries |
| `getPerfSummary` | `src/hooks/useDataFetch.ts` | Aggregated avg/failure stats per endpoint |

## No-Spinner Policy

Spinners are allowed for 3 seconds max. After that:
- 3-5s: Show "Still working..." secondary state
- 5s+: Auto-fail with retry button and error explanation

Endless spinning is **forbidden**. Use `useTimedLoader` + `TimedLoader` component.

## Optimistic UI

Where safe (meal tracking, mark complete, profile updates):
- Show immediate UI update
- Sync in background via `useOptimistic`
- Revert on failure with toast

## Performance Logging

Every `useDataFetch` call automatically logs:
- Query key, duration, success/failure
- Flagged 🔴 if >3s average

Access via `getPerfSummary()` for admin dashboard.

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
- [ ] Has retry option
- [ ] Parallel loading (no sequential blocking)
- [ ] No redirect before DB confirmation
