
## Diagnosis

Keith is on iOS native, and the freeze appeared as your roster jumped from 30 → 71 clients. Backend is healthy (DB 31% mem, 20% disk, 53/90 conns, slowest query 25ms mean). **The freeze is client-side** — long lists rendered with zero virtualization plus a spray of realtime subscriptions and re-render cascades that scale linearly (or worse) with client count.

Concrete findings from the code:

- **No virtualization anywhere.** `rg react-window|react-virtual|virtualiz` returns nothing. `CoachThreadList`, `ConversationList`, `SelectableClientCards` (926 lines), `AutoMessagingManager` (1072 lines), `ThreadChatView` (995 lines), roster and calendar coach views all render every row as a real DOM node. At 71 clients + 71 threads + N messages each, WebKit on iOS chokes.
- **Realtime channels multiply.** 13+ files open `.channel(...)` subscriptions (messaging, sleep, health, community, program, layout). Each open thread adds another WS subscription, and old ones are not always torn down cleanly.
- **Avatars are raw originals** (recent regression fix). Each avatar = a fresh 200–800KB image decode. 71 avatars in a list = huge memory + main-thread decode stalls on iOS.
- **Wide `select("*")` reads** on `nutrition_logs` (57 cols), `foods` (33 cols), `supplements` (54 cols), `onboarding_profiles` (57 cols) inflate payloads and JSON parse time.
- **Coach dashboards (Command Center, roster, tracker) fan out N queries per client** rather than one aggregated query, and re-fetch on every mount because caches key on user only.

## Scope

Full scale pass, staged. Client-side rendering + query shape only. **Not touching:** CacheBuster, auth, dashboard snapshot, upload path, native plugins, RLS, or any completed perf work.

## Plan

### Stage 1 — Kill the scroll freeze (highest impact, ship first)

1. **Add list virtualization** with `@tanstack/react-virtual` (no native deps, works in Capacitor).
   - `CoachThreadList` and `ConversationList` — virtualize thread rows.
   - `ThreadChatView` message list — virtualize with reverse scroll + windowed rendering; stop rendering 400 messages at once.
   - `SelectableClientCards`, `InviteList`, `DeactivatedClientsList`, `AutoMessagingManager` recipient picker — virtualize.
   - Coach roster / Command Center client grid — virtualize.
2. **Avatar thumbnails.** Reintroduce the Supabase image transform for list contexts only (size 48/64/96) but pass both `width` AND `height` so aspect is preserved (the original bug was width-only → tall crop). Keep raw URL for profile detail views. This restores the ~90% payload reduction without the zoom regression.
3. **Debounce realtime + tear-down audit.** Add a single shared realtime manager for coach messaging so we open one channel per active thread, not one per mount. Ensure every `useEffect` opening a channel returns a cleanup that calls `removeChannel`.

### Stage 2 — Reduce query weight

4. **Narrow `select("*")`** on hot paths: `nutrition_logs`, `foods`, `supplements`, `thread_messages`, `calendar_events`. Select only the columns each surface renders.
5. **Aggregate coach queries.** Replace per-client fan-out on Command Center / Roster / Tracker with a single query joined by `coach_id`, then group in JS. Add composite indexes where the migration confirms they are missing (`calendar_events(target_client_id, event_date)`, `thread_messages(thread_id, created_at DESC)`, `nutrition_logs(client_id, logged_at)`).
6. **Cache keying per client.** `useDataFetch` keys that currently cache `dashboard:<coachId>` should include the selected client id to prevent redundant refetches while pivoting the roster.

### Stage 3 — Render hygiene

7. **`React.memo` + stable keys** on `ThreadRow`, `ClientCard`, `MessageBubble`, `TodayActionRow`, calendar day cell.
8. **Move heavy derivations into `useMemo`** (compliance calc, macro sums, sorted rosters). Right now several run on every parent re-render.
9. **Split monolith components.** `ThreadChatView` (995), `AutoMessagingManager` (1072), `SelectableClientCards` (926) → extract row components so React can bail out of unchanged rows.
10. **Image decoding hints.** `loading="lazy" decoding="async"` on all list images; `content-visibility: auto` on off-screen cards.

### Stage 4 — Instrument + verify

11. Extend `getPerfSummary()` / PerfHUD to log FPS drops and long tasks (`PerformanceObserver` for `longtask`) so we can see if any single interaction still blocks >100ms.
12. Playwright scripted scroll on `/messages`, `/clients`, `/community` with a synthetic 71-item dataset; measure scripting/rendering time before + after each stage.

## Files (representative, not exhaustive)

```text
src/components/messaging/CoachThreadList.tsx        virtualize + memo row
src/components/messaging/ConversationList.tsx       virtualize
src/components/messaging/ThreadChatView.tsx         split + virtualize messages
src/components/clients/SelectableClientCards.tsx    virtualize + row memo
src/components/clients/InviteList.tsx               virtualize
src/components/clients/DeactivatedClientsList.tsx   virtualize
src/components/messaging/AutoMessagingManager.tsx   split + virtualize
src/components/profile/UserAvatar.tsx               reintroduce w+h transform for lists
src/lib/supabaseImage.ts                            require both dims when resize=cover
src/hooks/useDataFetch.ts                           per-client key helper
src/lib/realtimeManager.ts (new)                    single-flight channels
src/components/dev/PerfHUD.tsx                      longtask + FPS
supabase migration                                  composite indexes (verify absent first)
```

## Non-technical summary

Your app was built assuming ~30 clients. At 71, every screen tries to draw every row and every avatar at once, and iOS runs out of budget mid-scroll — that is the freeze Keith is feeling. The plan is: only render what's on screen (virtualization), send smaller thumbnails again (fixed without the zoom bug), send fewer/smaller queries, and cut duplicate realtime connections. Trainerize handles millions because they do exactly this — none of it requires a rewrite, just applying it surface-by-surface. Staged so Stage 1 alone should end the freezing.
