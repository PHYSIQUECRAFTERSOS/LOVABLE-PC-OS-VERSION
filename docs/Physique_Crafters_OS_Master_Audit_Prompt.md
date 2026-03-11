# PHYSIQUE CRAFTERS OS — COMPLETE AUDIT, EXTRACTION & REBUILD MASTER PROMPT

---

## ROLE

You are a world-class app consultant, senior full-stack engineer, database architect, and product strategist. You have been hired to perform a complete audit and extraction of the Physique Crafters OS application. Your job is to produce a single, exhaustive document that captures every feature, every screen, every database table, every integration, every UI component, every user flow, every edge case, and every configuration — so that a separate engineering team (Claude Code) can rebuild the entire application from scratch with zero ambiguity.

You are NOT building anything in this prompt. You are AUDITING and DOCUMENTING.

---

## CONTEXT

Physique Crafters OS is an AI-powered fitness coaching platform (PWA) with three user roles: Admin, Coach, and Client. It was originally built in Lovable and has been partially migrated to Claude Code + Vercel. The Claude Code version is missing significant features, has UI degradation, broken navigation, and missing screens. This audit will serve as the single source of truth to restore and improve everything.

**Tech Stack:**
- Frontend: React + Vite PWA, Tailwind CSS, Capacitor (iOS/Android)
- Backend: Supabase (Postgres, Auth, Edge Functions, RLS on all tables)
- Hosting: Vercel (app.physiquecrafters.com)
- Design System: Dark background (#0a0a0a), Gold accent (#D4A017), mobile-first 375px
- Barcode: ZXing-js
- Food Data: Open Food Facts (primary), UPC Item DB (secondary/Canadian fallback), USDA API

---

## YOUR MISSION

Audit every file, component, page, route, hook, utility, Supabase table, RLS policy, edge function, and configuration in this Lovable project. Then produce a SINGLE STRUCTURED DOCUMENT with the following sections, in this exact order. Do not skip anything. Do not summarize. Be exhaustive.

---

## OUTPUT FORMAT

Produce one continuous document with the following numbered sections. Use precise, implementable detail — not summaries. Every feature must include: what it does, what screens/components it uses, what database tables it reads/writes, what the UI looks like, and what the user flow is step-by-step.

---

# SECTION 1: APPLICATION ARCHITECTURE OVERVIEW

## 1.1 File Tree
List every file and folder in the project. Group by:
- `/src/pages/` — every page/route
- `/src/components/` — every component, organized by feature module
- `/src/hooks/` — every custom hook
- `/src/utils/` — every utility function
- `/src/services/` — every service/API layer
- `/src/contexts/` — every context provider
- `/src/types/` — every TypeScript type/interface
- `/src/lib/` — library configs (Supabase client, etc.)
- `/supabase/` — migrations, edge functions, seed files
- Root config files (vite.config, tailwind.config, capacitor.config, etc.)

## 1.2 Routing Map
List every route in the application:
- Path (e.g., `/dashboard`, `/training/program/:id`)
- Component it renders
- Auth requirement (public, client, coach, admin)
- Navigation method (bottom tab, side menu, deep link, redirect)

## 1.3 Navigation Structure
Document the bottom tab navigation:
- Which tabs exist for each role (Client, Coach, Admin)
- Tab icons and labels
- Active/inactive states
- Any conditional tabs (shown/hidden based on state)

## 1.4 Auth Flow
- How login works (email/password, magic link, invite)
- How signup works
- How invite acceptance works (token flow, role assignment)
- How role-based routing works after login
- Session persistence mechanism
- Password reset flow

---

# SECTION 2: ONBOARDING SYSTEM

## 2.1 Client Onboarding Flow
Document every step of client onboarding:
- Step 1: What screen? What fields? What validations?
- Step 2: What screen? What fields? What validations?
- Continue for EVERY step...
- What questions are asked?
- What goals/habits are selected?
- What equipment/gym info is collected?
- What body stats are collected initially?
- Where does onboarding data get stored? (exact table names and columns)
- What happens after onboarding completes? (redirect, dashboard state)

## 2.2 Coach Onboarding Flow
- Same level of detail as above

## 2.3 Admin Setup Flow
- Initial workspace setup
- Coach invitation flow
- Client invitation flow

## 2.4 Invite System
- How invites are generated (tokens, expiry, link format)
- Invite acceptance flow step-by-step
- Tables: invite_tokens (or equivalent) — list every column
- Edge cases: expired invite, already-accepted invite, wrong role

---

# SECTION 3: CLIENT DASHBOARD (HOME)

## 3.1 Layout
- What components appear on the home screen?
- Order of sections (top to bottom)
- What data is fetched on mount?

## 3.2 Today's Actions / Action Steps
- What items appear in "Today's things to do"?
- Where does each action link to? (exact route)
- How are actions determined? (calendar events, habits, static config)
- Data source: `calendar_events` table? Other?

## 3.3 Quick Stats
- What stats are shown? (weight, streak, compliance, etc.)
- Data source for each

## 3.4 Greeting / Header
- What info is displayed? (name, date, coach name)
- Personalization logic

---

# SECTION 4: TRAINING SYSTEM

## 4.1 Programs
- How programs are created (Coach flow, step-by-step)
- Program data model: table name, every column, relationships
- Multi-program support: how multiple programs work per client
- Program status: active, archived, template
- Program assignment: how coach assigns program to client

## 4.2 Workout Days
- How workout days are structured within a program
- Editable day names (e.g., "Day 3: Pull Day")
- Day ordering and numbering logic
- Custom tag workouts (Core Day, Daily Stretches) — distinct from numbered days
- Display: muted purple/slate pill badge for custom tags
- Data model: table name, every column

## 4.3 Exercises Within Workouts
- Exercise data model: every field (name, muscle group, equipment, video link, instructions, sets, reps, rest, RIR)
- Exercise ordering within a workout day
- Exercise library / database: how exercises are stored globally vs. per-workout
- Adding exercises to a workout (search, select, configure)
- Removing/swapping exercises (session-only, never modifies master program)

## 4.4 Client Workout Logging
- How a client opens today's workout
- Set-by-set logging flow:
  - Weight input
  - Reps input
  - RIR input
  - Notes per set
- Unlogged sets: saved as `null` (not `0`)
- Previous workout data displayed (last weight, last reps)
- Completion state: how a workout is marked complete

## 4.5 Rest Timer
- When does the timer start? (after logging a set)
- Timer display: countdown UI
- Timer sound: ring/alarm when finished
- Rest duration: per-exercise setting or global?
- Rest field input: `type="text"` with `inputmode="numeric"` (to avoid leading-zero bugs)
- Behavior: auto-start, manual dismiss, auto-dismiss?

## 4.6 Personal Records (PRs)
- What counts as a PR? (heaviest weight per exercise? 1RM estimate? volume PR?)
- How PRs are calculated and stored
- PR display: where do users see their PRs? (exercise detail? dedicated PR screen?)
- PR history: can users see PR progression over time?
- Data model: table name, columns
- Badge/notification when a new PR is hit

## 4.7 Exercise Video Library
- YouTube embed implementation
- Where videos appear (exercise detail screen)
- Fullscreen support
- Video link storage (per exercise in library)

## 4.8 Workout History
- How clients view past workouts
- History display: by date, by program, by exercise?
- Data model for logged workout data

---

# SECTION 5: NUTRITION SYSTEM

## 5.1 Macro Targets
- Coach sets calories
- Macro slider: Protein % / Carbs % / Fat %
- Auto-calculation of grams from percentages
- UI: slider component details, min/max constraints
- Data model: table, columns
- Per-client targets vs. global defaults

## 5.2 Food Database
- Primary source: Open Food Facts API integration details
- Secondary source: UPC Item DB (Canadian product fallback)
- USDA API integration
- Local food cache: how foods are cached in Supabase
- Search behavior: most popular foods appear first (ranking metadata)
- Food data model: food name, calories, protein, carbs, fat, serving size, brand, barcode, serving units
- Brand handling

## 5.3 Food Logging
- How a client logs food for a meal
- Search flow: type to search → results → select → confirm serving size → add
- Recent foods: how recent foods are tracked and displayed
- Favorites: how favorites are saved and displayed
- Manual entry: can clients add custom foods?

## 5.4 Barcode Scanner
- ZXing-js implementation details
- Camera access flow
- Scan → lookup → display food → add to meal
- Fallback when barcode not found
- UPC Item DB fallback for Canadian products

## 5.5 Meal Plan Builder (Coach)
- How coaches create meal plans
- Meal structure: meals per day, food items per meal
- Portion size adjustment
- Auto macro calculation
- Copy meal from another client: flow, data mapping, history tracking
- Import from template library
- Save as template

## 5.6 Nutrition Dashboard (Client View)
- Daily macro summary display
- Meal-by-meal breakdown
- Progress bar / ring for each macro
- Remaining macros calculation

---

# SECTION 6: CALENDAR SYSTEM

## 6.1 Calendar View
- Monthly view, weekly view, or both?
- How events appear on calendar cells
- Color coding by event type

## 6.2 Calendar Event Types
For each event type, document:
- Workout: displays workout day name (e.g., "Day 3: Pull Day")
- Cardio: type + target (none/distance/time/custom)
- Weight check-in
- Progress photos
- Habits
- Steps goal
- Custom events

## 6.3 Scheduling (Coach)
- Single day scheduling
- Multi-day scheduling
- Weekly repeat
- Custom repeat patterns
- X-number-of-weeks scheduling
- Recurrence metadata storage

## 6.4 Calendar Events Data Model
- `calendar_events` table: every column
- This is the single source of truth for Today's Actions
- Relationships to programs, workouts, cardio, etc.
- RLS policies on this table

## 6.5 Client Calendar Interaction
- Clicking a workout event → opens full workout view
- Clicking a cardio event → opens cardio detail
- Clicking other events → what happens?

---

# SECTION 7: CARDIO SYSTEM

## 7.1 Cardio Types
- Walk, Run, Bike, Row, Custom
- How types are stored

## 7.2 Cardio Targets
- None, Time, Distance, Custom
- Target data model

## 7.3 Cardio Scheduling
- How coach schedules cardio on calendar
- Repeat options

## 7.4 Cardio Tracking (Client)
- How client logs cardio completion
- Duration, distance, type logged
- History view

---

# SECTION 8: BODY STATS & PROGRESS TRACKING

## 8.1 Body Weight Tracking
- Weight logging flow
- Weight history chart
- Data model
- Always visible (not toggle-gated)

## 8.2 Body Measurements
- What measurements are tracked? (list every one)
- Measurement toggle defaults to OFF
- How measurements are logged
- History display

## 8.3 Progress Photos
- Photo upload flow (camera or gallery)
- Photo categories (front, side, back)
- Photo gallery / timeline view
- Storage: Supabase Storage bucket details
- Privacy: who can see photos (client + assigned coach only)

## 8.4 Check-In System
- Weekly check-in prompts
- What data is collected in a check-in?
- Check-in submission flow
- Coach view of client check-ins
- Check-in history
- Data model

## 8.5 Compliance Score
- How compliance is calculated
- What factors contribute
- Where it's displayed

---

# SECTION 9: HABIT TRACKING

## 9.1 Habit Types
- List every default habit
- Steps, sleep, meal compliance, workout completion, custom habits
- EXCLUSION: "Track Water" must NOT exist anywhere

## 9.2 Daily Habit Checklist
- How habits appear on the dashboard
- Check/uncheck flow
- Habit streak tracking

## 9.3 Coach Habit Configuration
- How coach assigns habits to clients
- Habit protocols from template library

## 9.4 Data Model
- Table name, every column
- Relationships

---

# SECTION 10: COMMUNITY FEATURES

## 10.1 Community Feed
- What is the feed? (social-style post feed? activity feed? challenge feed?)
- Who can post? (clients? coaches? both?)
- Post types: text, photo, workout share, PR share, milestone
- Like/comment functionality
- Feed filtering or categories

## 10.2 Feed Display
- UI layout of feed items
- Infinite scroll or pagination?
- How posts are ordered (chronological, engagement-weighted)

## 10.3 Data Model
- Posts table, comments table, likes table
- Every column in each
- RLS: who can see what

---

# SECTION 11: CHALLENGES

## 11.1 Challenge Types
- Coach-created challenges? Group challenges? Individual?
- Challenge categories (workout, nutrition, habit, custom)
- Challenge duration (start date, end date, ongoing)

## 11.2 Challenge Creation (Coach/Admin)
- Step-by-step creation flow
- Fields: name, description, type, target, duration, participants
- Scoring/tracking mechanism

## 11.3 Challenge Participation (Client)
- How clients join challenges
- Progress tracking within a challenge
- Leaderboard display
- Challenge completion / rewards

## 11.4 Data Model
- All challenge-related tables
- Every column
- Relationships to users, progress data

---

# SECTION 12: MESSAGING SYSTEM

## 12.1 Thread List
- How threads are displayed
- Thread participants (1:1 coach-client)
- Unread count badges
- Thread ordering (most recent first)

## 12.2 Message View
- Message bubbles UI
- Sent/received styling
- Timestamps
- Message types: text, attachment (if supported)
- Coach display name mapping (shows "Kevin Wu" not generic labels)
- Load time requirement: under 2 seconds

## 12.3 Sending Messages
- Text input
- Attachment upload (if supported)
- Send button behavior
- Real-time updates (Supabase realtime subscriptions?)

## 12.4 Open Client Profile From Messages
- Link/button to open client profile directly from message thread
- What profile view opens

## 12.5 Data Model
- Threads table, messages table, attachments table
- Every column
- RLS policies

---

# SECTION 13: COACH COMMAND CENTER

## 13.1 Coach Dashboard
- Layout and sections
- Client list display
- Quick actions available

## 13.2 Client List
- Client cards: what info is shown per client
- Sorting / filtering options
- Search

## 13.3 Quick Message
- Send message to client from dashboard
- Flow: select client → type message → send

## 13.4 Program Builder
- Full program creation flow (step-by-step):
  1. Name program
  2. Add workout days
  3. Name each workout day
  4. Add exercises to each day
  5. Configure sets/reps/rest/RIR per exercise
  6. Add exercise video links
  7. Save program
  8. Assign to client(s)
- Edit existing program flow
- Duplicate program flow

## 13.5 Meal Plan Builder
- (Reference Section 5.5 but document coach-specific UI here)

## 13.6 Calendar Scheduling (Coach)
- Scheduling interface for coach
- Bulk scheduling capabilities
- Multi-client scheduling

## 13.7 Client Progress View (Coach)
- How coach views individual client progress
- Stats, charts, compliance, photos
- Check-in review interface

---

# SECTION 14: ADMIN SYSTEM

## 14.1 Admin Dashboard
- Layout and sections
- Analytics overview

## 14.2 Coach Management
- Add coaches
- Remove coaches
- Assign roles
- Coach status (active, invited, disabled)

## 14.3 Client Management
- View all clients
- Assign/reassign coaches to clients

## 14.4 Analytics
- What metrics are shown?
- Client growth, engagement, compliance

## 14.5 Database Management
- Any admin-level DB tools exposed in UI

## 14.6 Settings
- App configuration options
- Feature flags / toggles

---

# SECTION 15: TEMPLATE LIBRARY

## 15.1 Workout Program Templates
- How templates are saved
- Template categories (fat loss, hypertrophy, etc.)
- How templates are imported into a client

## 15.2 Meal Plan Templates
- Same structure as above

## 15.3 Habit Protocol Templates
- Same structure as above

## 15.4 Data Model
- Templates table(s): every column
- Usage counts, categories

---

# SECTION 16: COMPLETE SUPABASE SCHEMA

## 16.1 Every Table
For EACH table in the Supabase database, document:
- Table name
- Every column: name, type, nullable, default, constraints
- Primary key
- Foreign keys and relationships
- Indexes (including `pg_trgm` for search)
- Created_at / updated_at columns

## 16.2 RLS Policies
For EACH table, document every RLS policy:
- Policy name
- Operation (SELECT, INSERT, UPDATE, DELETE)
- USING clause (exact SQL)
- WITH CHECK clause (exact SQL)
- Which role it applies to

## 16.3 Edge Functions
For EACH edge function:
- Function name
- What it does
- Input parameters
- Return format
- Authentication requirement
- Which API keys it uses (from Supabase Vault)

## 16.4 Storage Buckets
- Bucket names
- What each stores (exercise videos, progress photos, profile photos, etc.)
- Access policies

## 16.5 Database Functions / Triggers
- Any custom PostgreSQL functions
- Any triggers
- Any views

---

# SECTION 17: DESIGN SYSTEM

## 17.1 Color Palette
- Background: #0a0a0a
- Gold accent: #D4A017
- All other colors used (text, borders, success, error, warning, cards, etc.)

## 17.2 Typography
- Font family
- Font sizes for each heading level, body text, labels, etc.
- Font weights used

## 17.3 Component Library
- Every reusable component (buttons, cards, inputs, modals, badges, tabs, etc.)
- Variants of each (primary, secondary, destructive, etc.)
- Sizing (padding, margins, border radius)

## 17.4 Icons
- Icon library used (Lucide? Custom?)
- List of icons used and where

## 17.5 Responsive Behavior
- Mobile-first 375px base
- Breakpoints
- How layouts adapt

---

# SECTION 18: TIMEZONE & DATE HANDLING

## 18.1 Rules
- `log_date` uses client's local date: `new Date().toLocaleDateString('en-CA')`
- User IANA timezone stored on profile at signup
- All display dates are local to the user
- Server timestamps are UTC

## 18.2 Where Timezone Matters
- Workout logging dates
- Calendar event display
- Nutrition log dates
- Check-in dates
- Streak calculations

---

# SECTION 19: PERFORMANCE & RELIABILITY

## 19.1 Load Time Requirements
- All screens under 3 seconds
- Message load under 2 seconds
- Invite acceptance under 3 seconds

## 19.2 Caching Strategy
- What is cached and where
- Cache invalidation rules
- API response caching

## 19.3 Data Fetching Patterns
- Batch `in()` queries (no N+1)
- Pagination patterns
- Lazy loading implementation

## 19.4 Error Handling
- Error boundary components
- Retry logic
- User-facing error messages
- Offline behavior (if any)

---

# SECTION 20: SECURITY & PERMISSIONS

## 20.1 Role-Based Access Matrix
Create a complete matrix:
- Every screen × every role = allowed/denied
- Every API action × every role = allowed/denied

## 20.2 Data Access Rules
- Client sees only their own data
- Coach sees only assigned clients' data
- Admin sees everything
- Coach authority: coach-set values are never auto-modified

## 20.3 Authentication Security
- Token handling
- Session management
- Invite token security

---

# SECTION 21: PAYMENT SYSTEM (If Present)

## 21.1 Subscription Tiers
- Base tier
- VIP weekly calls tier
- Any other tiers

## 21.2 Payment Integration
- Payment provider (Stripe? Other?)
- Subscription management flow
- Webhook handling

## 21.3 Data Model
- Subscriptions table, payment history
- Sensitive data handling (no payment tokens exported)

---

# SECTION 22: FUTURE AI FEATURES (Document What Exists)

## 22.1 AI Meal Scanning
- Implementation status
- If exists: how it works, what API, flow

## 22.2 AI Body Fat Estimation
- Same

## 22.3 AI Macro Adjustment
- Same

## 22.4 AI Coaching Insights
- Same

---

# SECTION 23: CONSULTANT IMPROVEMENT RECOMMENDATIONS

After completing the full audit, provide a section with your professional recommendations for improvements. Organize by priority:

## 23.1 Critical (Must Fix)
- Features that are broken or missing that existing clients depend on
- Security gaps
- Data integrity issues
- Performance bottlenecks

## 23.2 High Priority (Should Add)
- Features that would significantly improve coach workflow efficiency
- Client engagement and retention improvements
- UX/UI improvements that reduce friction

## 23.3 Medium Priority (Nice to Have)
- Advanced analytics for coaches/admin
- Automation opportunities (auto-scheduling, smart recommendations)
- Integration opportunities (wearables: Apple Health → Google Fit → Fitbit → Whoop)
- White-labeling capabilities
- Push notification strategy

## 23.4 Future Vision
- AI-powered features roadmap
- Scaling considerations
- Revenue optimization features
- Community/social engagement features expansion

For each recommendation, provide:
- What to build
- Why it matters (business impact)
- How complex it is (S/M/L/XL)
- Dependencies

---

# SECTION 24: IMPLEMENTATION DEPENDENCIES & CONFIG

## 24.1 Package.json Dependencies
List every npm dependency with version

## 24.2 Environment Variables
List every env variable needed (names only, not values):
- Supabase URL, Anon Key
- API keys (ANTHROPIC, USDA, etc.)
- Vercel config

## 24.3 Capacitor Configuration
- iOS config
- Android config
- Plugin list

## 24.4 Vite Configuration
- Relevant vite.config settings

## 24.5 Tailwind Configuration
- Custom theme extensions
- Plugins

---

# SECTION 25: KNOWN RULES & CONSTRAINTS (NON-NEGOTIABLE)

These rules must be preserved in any rebuild. Document each one and where it applies:

1. `calendar_events` is the single source of truth for Today's Actions
2. Exercise delete/switch is session-only — never modifies the master program
3. Coach-set targets are always authoritative over client or automated values
4. Coach-set workout names, targets, and labels must never be modified by automated renumbering or reordering logic
5. Display position numbers are computed sequentially at render time, not read from raw DB storage values
6. `log_date` must use client's local date (`new Date().toLocaleDateString('en-CA')`), not UTC server time
7. User IANA timezone stored on profile at signup
8. Rest (s) field requires `type="text"` with `inputmode="numeric"` to avoid leading-zero bugs
9. Unlogged sets saved as `null`, not `0`
10. Custom tag workouts excluded from numbered day sequence, displayed with muted purple/slate pill badge
11. "Track Water" must not exist anywhere in the app
12. Wearable sync priority: Apple Health → Google Fit → Fitbit → Whoop
13. Body Stats measurements toggle defaults to OFF; Body Weight always visible
14. Food search: Open Food Facts primary, UPC Item DB secondary (Canadian fallback)
15. SQL migrations use `CREATE TABLE IF NOT EXISTS` and `DO $$ BEGIN IF NOT EXISTS` guards
16. Database queries avoid N+1 patterns (batch `in()` queries preferred)
17. Every new data access pattern needs explicit RLS coverage

---

# SECTION 26: COMPLETE SCREEN-BY-SCREEN INVENTORY

For EVERY screen in the application, create an entry with:

| Field | Detail |
|-------|--------|
| Screen Name | — |
| Route | — |
| Role Access | Client / Coach / Admin / All |
| Parent Navigation | Bottom tab / Settings menu / Deep link |
| Components Used | List every component rendered on this screen |
| Data Fetched | What queries run on mount |
| User Actions Available | Every button, link, form, toggle on this screen |
| State Management | Local state, context, URL params |
| Connected Screens | What screens this links to |

---

# FORMATTING REQUIREMENTS

1. Use exact table names, column names, and component file names — not approximations
2. Include TypeScript types/interfaces for all data models
3. For every UI component, describe the visual appearance (colors, spacing, layout)
4. For every user flow, describe it as numbered steps a developer could follow
5. For every database operation, include the Supabase query pattern (e.g., `.from('table').select('*').eq('user_id', userId)`)
6. If something is unclear or appears incomplete in the codebase, flag it with [INCOMPLETE] or [UNCLEAR] and describe what you found

---

# FINAL INSTRUCTION

Do not leave anything out. If a feature exists in this codebase — even partially — document it. If a table exists in Supabase — even if unused — document it. If a component exists — even if orphaned — document it. The goal is a complete, zero-ambiguity specification that another team can use to rebuild Physique Crafters OS from the ground up, losing nothing and gaining the improvements recommended in Section 23.

This document will be the single source of truth. Treat it that way.
