

## Trainerize-Style Desktop Messages Layout

### Problem
The Messages page currently renders as a full-screen overlay (`fixed inset-0 z-50`) that hides all navigation. On desktop, there's no sidebar and no way to navigate to other pages without going back. On mobile this is fine (native-feel), but on desktop it should show the full AppLayout with a split-panel messaging view.

### Solution

**1. `src/pages/Messages.tsx` — Wrap in AppLayout on desktop**
- Remove the `fixed inset-0 z-50` overlay approach
- Wrap the page in `<AppLayout>` so the desktop sidebar (Overview, Messages, Community, Ranked, Clients, etc.) is always visible
- The mobile experience stays the same (full-screen with safe areas) by conditionally rendering the overlay only on mobile (`md:` breakpoint)
- On desktop, render the messaging content inside AppLayout's `<main>` area with no padding override

**2. `src/components/messaging/CoachMessaging.tsx` — Split panel on desktop**
- On desktop (`md:` and above): render a two-column layout side-by-side
  - Left column (~320px): Thread list with Conversations/Automations tabs
  - Right column (flex-1): Active thread's `ThreadChatView`, or an empty state ("Select a conversation")
- On mobile: keep the current behavior (thread list → full-screen chat with back button)
- Use `useIsMobile()` hook or Tailwind `hidden md:flex` classes to switch layouts
- When selecting a thread on desktop, it loads in the right panel without replacing the thread list

**3. `src/components/messaging/ClientMessaging.tsx` — Desktop layout with sidebar context**
- Client only has one thread (with their coach), so on desktop the chat fills the content area naturally
- Remove the back-to-dashboard button on desktop since AppLayout sidebar provides navigation
- Keep `showBackToDashboard` for mobile only

**4. Mobile behavior preserved**
- On mobile (`< md`), Messages still renders as the full-screen overlay with safe area handling
- The slide-in animation and bottom-nav hiding behavior remain untouched
- CoachMessaging on mobile still does the thread list → full chat swap

### Layout on Desktop (Coach)
```text
┌──────────────┬────────────────┬──────────────────────────┐
│  Sidebar     │  Thread List   │  Active Chat             │
│  (AppLayout) │  ~320px        │  (ThreadChatView)        │
│              │                │                          │
│  Overview    │  [Search...]   │  ┌─ Header ─────────┐    │
│  Messages ●  │  Kevin (Client)│  │ Scott Szeto       │    │
│  Community   │  Scott Szeto   │  ├───────────────────┤    │
│  Challenges  │  Zane Karuna   │  │                   │    │
│  Ranked      │  Alley Raymond │  │  Messages...      │    │
│  Clients     │  Test Account  │  │                   │    │
│  Tracker     │                │  ├───────────────────┤    │
│  Team        │  [Automations] │  │ Type a message... │    │
│  Libraries   │                │  └───────────────────┘    │
│  ─────────── │                │                          │
│  Settings    │                │                          │
│  Admin       │                │                          │
│  Sign Out    │                │                          │
└──────────────┴────────────────┴──────────────────────────┘
```

### Files Modified
- `src/pages/Messages.tsx` — conditional AppLayout wrapper (desktop) vs overlay (mobile)
- `src/components/messaging/CoachMessaging.tsx` — split-panel layout on desktop
- `src/components/messaging/ClientMessaging.tsx` — hide back button on desktop

### Improvements
- Full navigation access while messaging (matches Trainerize UX)
- Coach can see thread list and active chat simultaneously on desktop
- Unread badge on Messages nav item visible at all times
- No layout change needed for mobile — preserves the native-feel experience

