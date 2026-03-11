# PHYSIQUE CRAFTERS OS — COMPLETE APPLICATION AUDIT

_Generated: 2026-03-11_

---

## 1. APPLICATION ARCHITECTURE OVERVIEW

### 1.1 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui |
| Backend | Supabase (PostgreSQL, Auth, Edge Functions, Storage, Realtime) |
| Hosting | Lovable Cloud → `app.physiquecrafters.com` |
| Mobile | Capacitor (iOS/Android wrapper) |
| Design | Dark theme (#0a0a0a bg, #D4A017 gold accent), mobile-first 375px |
| Barcode | ZXing-js |
| Food APIs | Open Food Facts, USDA API |
| Charts | Recharts |
| Forms | React Hook Form + Zod |
| State | TanStack React Query |
| Routing | React Router v6 |

### 1.2 User Roles (Enum: `app_role`)

| Role | Access |
|------|--------|
| **admin** | Full platform access + admin panel + team management |
| **coach** | Client management, program building, messaging, libraries |
| **client** | Personal dashboard, training, nutrition, progress, community |

Roles stored in `user_roles` table. Helper function `public.has_role(user_id, role)` for RLS policies.

### 1.3 Entry Point Flow

```
index.html → src/main.tsx (env guard + ErrorBoundary) → App.tsx (providers + router)
```

**Providers (outermost first):**
1. `QueryClientProvider` (React Query)
2. `TooltipProvider`
3. `AuthProvider` (session + role hydration)
4. `BrowserRouter`
5. `Suspense` (wraps all routes)

---

## 2. ROUTING & PAGES

### 2.1 Public Routes

| Path | Page | Purpose |
|------|------|---------|
| `/` | `Index` | Redirect: authenticated → `/dashboard`, else → `/auth` |
| `/auth` | `Auth` | Sign-in only (invite-only system, no public registration) |
| `/forgot-password` | `ForgotPassword` | Password reset request |
| `/reset-password` | `ResetPassword` | Password reset confirmation |
| `/privacy-policy` | `PrivacyPolicy` | Legal page |
| `/terms-of-service` | `TermsOfService` | Legal page |
| `/delete-account` | `DeleteAccount` | GDPR account deletion request |
| `/setup` | `Setup` | Client invite acceptance + password creation + document signing |
| `/accept-invite` | `AcceptInvite` | Staff (coach) invite acceptance |

### 2.2 Protected Routes (all wrapped in `ProtectedRoute`)

| Path | Page | Allowed Roles | Description |
|------|------|--------------|-------------|
| `/onboarding` | `Onboarding` | client | 14-step intake questionnaire |
| `/dashboard` | `Dashboard` | all | Role-branched: Client Dashboard or Coach Command Center |
| `/training` | `Training` | all | Workout list, logger, cardio, history |
| `/nutrition` | `Nutrition` | all | Food tracker, meal plans, supplements, recipes, micros |
| `/analytics` | `Analytics` | all | TDEE engine, adherence analytics |
| `/messages` | `Messages` | all | 1:1 messaging + coach automations |
| `/progress` | `Progress` | all | Check-ins, weight, photos, body fat, steps, trends |
| `/profile` | `Profile` | all | Settings, avatar, health integrations, documents |
| `/calendar` | `Calendar` | all | Week/month view, workout/cardio/checkin events |
| `/community` | `Community` | all | Social feed, announcements, leaderboard |
| `/challenges` | `Challenges` | all | Culture engine, identity tiers, challenges |
| `/team` | `Team` | coach, admin | Staff management, coach invites |
| `/clients` | `Clients` | coach, admin | Client roster, invites, bulk messaging |
| `/clients/:clientId` | `ClientDetail` | coach, admin | Client workspace (9 tabs) |
| `/libraries` | `MasterLibraries` | coach, admin | Programs, exercises, meals, recipes, foods |
| `/admin` | `Admin` | admin | Platform metrics, user management, compliance |

### 2.3 ProtectedRoute Behavior

1. Shows spinner while auth loading (8s stall timeout → recovery UI)
2. Redirects unauthenticated users to `/auth`
3. Redirects unauthorized roles to `/dashboard`
4. Checks `onboarding_profiles.onboarding_completed` for clients → redirects to `/onboarding` if incomplete
5. Wraps client content in `ReSignPrompt` to enforce updated document signatures

---

## 3. NAVIGATION STRUCTURE

### 3.1 Coach/Admin Sidebar (Desktop) + Mobile Bottom Bar

**Primary Nav:** Overview, Messages, Community, Challenges, Clients, Team, Master Libraries  
**Secondary Nav:** Settings, Admin (admin only)  
**Mobile Bottom (Coach):** Overview, Clients, Messages, Community

### 3.2 Client Bottom Nav (Mobile)

Home, Calendar, Training, Nutrition, Messages  
**Full sidebar (desktop/hamburger):** Dashboard, Calendar, Training, Nutrition, Progress, Community, Messages, Challenges, Settings

---

## 4. FEATURE MODULES (EXHAUSTIVE)

### 4.1 Authentication & Onboarding

**Auth Page** (`/auth`): Sign-in only form. Invite-only system — no public registration.

**Client Setup Flow** (`/setup?token=xxx`):
1. Validate invite token via `validate-invite-token` edge function
2. Create password (min 8 chars)
3. Auto sign-in
4. Document signing flow (tier-aware: waiver, TOS, contract)
5. Redirect to `/onboarding`

**Staff Setup Flow** (`/accept-invite?token=xxx`):
1. Validate via `staff-invite` edge function
2. Create password
3. Auto sign-in → redirect to `/dashboard`

**Onboarding** (`/onboarding`) — 14 steps:
1. Disclaimer + Goals
2. Metrics (gender, age, height, weight, activity level)
3. Body Composition (body fat range, confidence, baseline photos)
4. Training Environment (home/gym, equipment photos)
5. Schedule (wake/workout/sleep times, occupation)
6. Food Preferences (loves/dislikes)
7. Nutrition History (macro tracking experience, intolerances, digestive issues)
8. Injuries/Surgeries
9. Training History (current days, realistic days, available days)
10. Motivation (text, favorite body part, area to work on)
11. Final Notes (free text)
12. Health Sync (Apple Health/Google Fit integration)
13. Digital Waiver (signature capture)
14. Summary (review all)

On completion: syncs weight to `weight_logs`, sends message to coach thread.

### 4.2 Client Dashboard

**Components:**
- `DateNavigator` — swipe between dates
- `StreakWidgets` — logging streak + workout streak
- `CoachPriority` — prioritized coach actions
- `DailyCompletionRing` — completed/total actions ring
- `TodayActions` — today's workout, cardio, check-in, nutrition tasks
- `ProgressWidgetGrid` — weight, photos, body stats, cardio popups
- `WeeklyMomentumScore` — weekly compliance score
- `ComplianceMomentum` — 30-day compliance trend
- `ProgressMomentum` — weight/photo trends
- `MacroSummary` — today's macro intake vs targets
- `UpcomingEvents` — next calendar events
- `QuickLogFAB` — floating action button for quick logging

### 4.3 Coach Command Center

**Component:** `CoachCommandCenter`  
Surfaces at-risk clients based on compliance scores:
- Workouts (40%), Nutrition (35%), Check-ins (15%), Activity (10%)
- Check-in review with Submitted/Missing queues
- Private notes + public responses on submissions
- 3-entry rolling trends (up/down/stable) for weight, compliance, stress

### 4.4 Training System

**Pages/Tabs:**
- **Program** (client view) — `ClientProgramView` shows assigned program phases/workouts
- **Workouts** — card grid, start/edit/duplicate workouts
- **Cardio** — `CardioManager` for assigned cardio + logs
- **History** — `WorkoutHistory` past sessions

**Workout Logger** (`WorkoutLogger`):
- Per-set logging: weight, reps, tempo, RIR
- Rest timer (floating + inline)
- Auto-fill from previous session
- Exercise video links (YouTube/custom)
- Progressive overload tracking
- Workout summary on completion

**Program Builder** (`ProgramBuilder` + `ProgramDetailView`):
- Multi-phase programs with duration weeks
- Training styles, intensity systems, progression rules
- Workout assignment to phases with sort order
- Master/template distinction
- Version control with `master_program_versions`
- Subscribe (linked) vs Import (independent copy) assignment
- Push updates to linked clients

**Exercise Library** (`ExerciseLibrary`):
- CRUD exercises with categories, equipment, muscle groups
- YouTube/video URL support
- Exercise media attachments
- Coach-scoped exercises

### 4.5 Nutrition System

**Tabs:**
- **Tracker** — `DailyNutritionLog` with food search, barcode scanner, meal scan (AI)
- **Micros** — `MicronutrientDashboard` + `ChronicDeficiencyTracker`
- **Supplements** — `SupplementLogger` with barcode scan, nutrient forms
- **Engine** (coach only) — `CoachNutritionAnalytics`
- **Plans** (coach only) — `MealPlanBuilder` multi-day structured plans
- **Recipes** — `RecipeBuilder` (client) + `PCRecipeLibrary` (coach)
- **Upload/Plan** — `CoachMealPlanUpload` (PDF) / `ClientMealPlanView` (PDF viewer)
- **My Plan** (client) — `ClientStructuredMealPlan`

**Food Search Pipeline:**
1. Local `food_items` table (full-text search)
2. Open Food Facts API (edge function)
3. USDA API (edge function)
4. Barcode lookup (ZXing scanner → edge function)
5. Custom food creation
6. AI Meal Scan (photo → macro estimation)

**Meal Management:**
- Saved meals with ingredient explosion
- Frequent meal detection via `frequent_meal_templates`
- Copy from previous 14 days
- Serving memory (`user_food_serving_memory`)
- Recent foods tracking

**Meal Plan Builder:**
- Multi-day types (Training, Rest, Refeed, Custom)
- Macro adjust engine with proportional scaling
- Deep cloning between clients
- Template library
- Copy from client modal

### 4.6 Progress & Biofeedback

**Tabs:**
- **Check-In** — `WeeklyCheckinForm` (client) / `CheckinReviewDashboard` (coach)
- **Forms** — `CheckinFormBuilder` (coach) / `CheckinSubmissionForm` (client)
- **Dashboard** — `ProgressMetricsDashboard` aggregated metrics
- **Weight** — `WeightTracker` with lbs chart
- **Photos** — Upload + Gallery + Before/After Comparison + AI Body Fat Estimation
- **Steps** — `StepsScreen` with step tracking
- **Trends** — `BiofeedbackTrends` multi-metric charting

**Check-in System:**
- Coach-built templates with question types: text, numeric, scale, boolean, choice
- Recurring assignments (weekly, bi-weekly)
- Submission tracking with due dates
- Coach review with notes + responses
- Week number tracking

### 4.7 Calendar

- Week and month views with `CalendarGrid`
- Event types: workout, cardio, checkin, rest, custom
- Linked events to workouts/cardio/checkins via foreign keys
- Auto-merge workout sessions and cardio logs
- Workout day labeling with program-aware numbering
- `ComplianceStreak` sidebar widget
- Coach can schedule events for clients
- Click workout → navigate to training page with auto-start

### 4.8 Messaging

**Coach view:** `CoachMessaging` with `CoachThreadList` + `ThreadChatView`  
**Client view:** `ClientMessaging` with `ConversationList` + `ChatView`

**Features:**
- 1:1 threads between coach and client (`message_threads` table)
- Real-time via Supabase Realtime
- Read receipts
- Auto-messaging system (`auto_message_templates` + `auto_message_triggers`)
- Bulk messaging composer for selected clients

### 4.9 Community

- Social feed with posts (text + media)
- Announcements (coach-only posting, pinnable)
- Comments + likes + saves
- Post reporting + moderation
- User engagement stats and badges
- Leaderboard (compliance-based)
- Real-time sync via `useCommunityRealtime`

### 4.10 Culture Engine & Challenges

**Identity System:**
- 4 tiers: Elite, Execution, Building, Inconsistent
- Weighted weekly compliance: Workouts 40%, Nutrition 35%, Check-ins 15%, Activity 10%
- `culture_profiles` with streaks, tier, lifetime averages
- `culture_badges`: Weekly Champion, Most Improved, Comeback
- `culture_spotlights`: Coach-pinned recognition
- `CultureLeaderboard`: Top 25 performers (biometrics hidden)

**Challenges** (sample data, framework ready):
- Challenge cards with status, participants, progress
- Join/create functionality

### 4.11 Analytics

**Adaptive TDEE Engine** (`useTDEE` hook):
- Calculates estimated TDEE from weight + calorie data
- Weekly weight change rate
- Metabolic adaptation percentage
- 4-week weight projection (coach only)
- TDEE history charting
- Goal selector (Fat Loss, Maintain, Lean Gain, Reverse Diet)
- Macro adjustment history

**Adherence Analytics** (`AdherenceAnalytics`):
- Nutrition adherence percentage tracking

### 4.12 Client Workspace (Coach View)

9 tabs in `ClientDetail`:

| Tab | Component | Purpose |
|-----|-----------|---------|
| Dash | `SummaryTab` | Client dashboard mirror |
| Check-Ins | `ClientCheckinHistory` | All submissions + responses |
| Onboarding | `OnboardingTab` | Intake data review |
| Calendar | `CalendarTab` | Client's calendar view |
| Training | `TrainingTab` | Exercise logs, program view |
| Nutrition | `NutritionTargetsTab` | Macro targets, food log |
| Meal Plan | `MealPlanTab` | Multi-plan builder |
| Progress | `ProgressTab` | Photos, weight, measurements |
| Messages | `MessagingTab` | Direct messaging |

### 4.13 Master Libraries (Coach)

7 tabs:

| Tab | Content |
|-----|---------|
| Programs | CRUD programs, phases, assign to clients, version control |
| Exercises | Exercise library with categories/equipment |
| Meals | `MealPlanTemplateLibrary` |
| PC Recipes | `PCRecipeLibrary` with ingredients + instructions |
| Foods | Coming soon |
| Habits | Coming soon |
| Forms | Coming soon |

### 4.14 Team Management

- Staff list with roles and client counts
- Invite coaches via `staff-invite` edge function
- Pending invite management with revocation
- Role display: Owner (admin), Coach

### 4.15 Admin Panel

- `PlatformMetrics` — user counts, activity
- `RetentionPanel` — risk scoring
- `InviteDashboard` — all coaches' invites
- `ComplianceOverview` — platform-wide compliance
- `DocumentManagement` — legal document templates
- `UserManagement` — user CRUD
- `BulkNotifications` — platform-wide messaging
- `LabelRepairTool` — calendar event label repair
- Seed Food Database utility

### 4.16 Profile & Settings

- Avatar upload to Supabase Storage
- Full name + phone editing
- Role display
- Health integrations (Apple Health / Google Fit via Capacitor)
- Document signature records
- Account deletion flow (GDPR compliant)

### 4.17 Legal & Compliance

- `DocumentSigningFlow` — tier-aware signing during setup
- `ReSignPrompt` — prompts re-signing when documents are updated
- `SignatureRecordsTable` — audit trail of all signatures
- `DocumentViewer` + `ESignaturePanel`
- IP address capture on signatures
- PDF storage in Supabase Storage

---

## 5. DATABASE SCHEMA

### 5.1 All Tables (65 tables)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `user_roles` | Role assignments | user_id, role (enum: admin/coach/client) |
| `profiles` | User profiles | user_id, full_name, avatar_url, phone, timezone, weight, weight_unit |
| `onboarding_profiles` | Client intake data | user_id, 40+ fields, onboarding_completed, current_step |
| `coach_clients` | Coach-client relationships | coach_id, client_id, status |
| `client_invites` | Client invitation tokens | email, invite_token, assigned_coach_id, tier_id, invite_status |
| `staff_invites` | Staff invitation tokens | email, invite_token, role, invited_by |
| `client_tiers` | Membership tiers | name, requires_contract, contract_template_key |
| `client_tags` | Client categorization | client_id, coach_id, tag |
| `client_goals` | Phase/goal tracking | client_id, goal, target_rate, target_weight |
| `client_notes` | Coach private notes | client_id, coach_id, content, is_pinned |
| `client_risk_scores` | At-risk scoring | client_id, score, risk_level, signals |
| `programs` | Training programs | coach_id, name, goal_type, is_template, is_master, version_number |
| `program_phases` | Program phases | program_id, name, duration_weeks, training_style, phase_order |
| `program_workouts` | Phase-workout links | phase_id, workout_id, sort_order, day_label |
| `client_program_assignments` | Program assignments | client_id, program_id, status, current_phase_id, is_linked_to_master |
| `master_program_versions` | Version snapshots | program_id, version_number, change_log |
| `workouts` | Workout templates | coach_id, client_id, name, phase, is_template, instructions |
| `workout_exercises` | Exercise prescriptions | workout_id, exercise_id, sets, reps, tempo, rest_seconds, rir |
| `workout_sessions` | Completed sessions | client_id, workout_id, status, started_at, completed_at |
| `exercise_logs` | Set-by-set logging | session_id, exercise_id, set_number, weight, reps, rir, tempo |
| `exercises` | Exercise library | name, category, equipment, muscle_group, youtube_url |
| `exercise_media` | Video attachments | exercise_id, media_type, video_url |
| `master_workouts` | Coach workout library | coach_id, workout_name, instructions |
| `master_workout_exercises` | Master workout exercises | master_workout_id, exercise_id, sets, reps |
| `personal_records` | PR tracking | client_id, exercise_id, weight, reps |
| `plateau_flags` | Stagnation detection | client_id, exercise_id, stagnant_sessions |
| `cardio_assignments` | Cardio prescriptions | client_id, coach_id, cardio_type, targets |
| `cardio_logs` | Cardio completions | client_id, cardio_type, duration_min, distance_km |
| `calendar_events` | Calendar entries | user_id, event_date, event_type, linked IDs |
| `nutrition_logs` | Food logging | client_id, food_item_id, meal_name, calories, protein, carbs, fat + 20 micronutrients |
| `nutrition_targets` | Macro targets | client_id, coach_id, calories, protein, carbs, fat, daily_step_goal |
| `food_items` | Food database | name, brand, macros per 100g, barcode, source, search_vector |
| `client_custom_foods` | Client-created foods | client_id, name, macros |
| `user_recent_foods` | Recently used foods | user_id, food_id |
| `user_food_serving_memory` | Preferred serving sizes | user_id, food_id, serving_size, serving_unit |
| `coach_favorite_foods` | Coach food bookmarks | coach_id, food_item_id |
| `coach_recent_foods` | Coach recent foods | coach_id, food_item_id |
| `frequent_meal_templates` | Auto-detected meal combos | user_id, combo_key, foods, occurrence_count |
| `meal_log_snapshots` | Meal copy source | user_id, logged_date, meal_name, foods |
| `saved_meals` | Saved meal recipes | client_id, name, macros |
| `saved_meal_items` | Saved meal ingredients | saved_meal_id, food_item_id, macros |
| `meal_plans` | Structured meal plans | client_id, coach_id, name, is_template |
| `meal_plan_days` | Day types within plans | meal_plan_id, day_type, day_order |
| `meal_plan_items` | Individual foods in plans | meal_plan_id, day_id, food_item_id, macros |
| `macro_adjustment_history` | Macro change audit | client_id, previous/new macros, reason |
| `supplements` | Supplement catalog | client_id, name, brand, full micronutrient profile |
| `supplement_logs` | Supplement intake logs | client_id, supplement_id, servings |
| `supplement_nutrient_forms` | Bioavailability data | supplement_id, nutrient_key, form_name |
| `supplement_stacks` | Grouped supplement protocols | coach_id, name, supplement_ids |
| `client_recipes` | Client-created recipes | client_id, name, macros per serving |
| `client_recipe_ingredients` | Recipe ingredients | recipe_id, food_name, macros |
| `pc_recipes` | Coach-published recipes | created_by, name, servings |
| `pc_recipe_ingredients` | PC recipe ingredients | recipe_id, food_item_id, quantity |
| `pc_recipe_instructions` | PC recipe steps | recipe_id, step_number, instruction_text |
| `weight_logs` | Daily weight entries | client_id, weight, logged_at, source |
| `body_measurements` | Body measurements | client_id, 15+ measurement fields |
| `progress_photos` | Progress photo storage | client_id, storage_path, photo_type, pose |
| `ai_body_fat_estimates` | AI body fat results | client_id, estimated_bf_pct, confidence range |
| `tdee_estimates` | TDEE calculations | client_id, estimated_tdee, weight_change_rate |
| `daily_health_metrics` | Wearable sync data | user_id, steps, sleep, HRV, weight |
| `client_health_metrics` | Health provider data | client_id, metric_type, provider, value |
| `health_connections` | Wearable connections | user_id, provider, is_connected |
| `checkin_templates` | Check-in form templates | coach_id, name, description |
| `checkin_questions` | Template questions | template_id, question_text, question_type |
| `checkin_assignments` | Assigned check-ins | client_id, coach_id, template_id, recurrence |
| `checkin_submissions` | Client submissions | client_id, assignment_id, status, submitted_at |
| `checkin_responses` | Individual answers | submission_id, question_id, answer fields |
| `message_threads` | 1:1 messaging threads | coach_id, client_id |
| `thread_messages` | Thread messages | thread_id, sender_id, content, read_at |
| `conversations` | Group conversations | created_by, type, name |
| `conversation_participants` | Conversation members | conversation_id, user_id |
| `auto_message_templates` | Message templates | coach_id, name, content, category |
| `auto_message_triggers` | Automation triggers | coach_id, trigger_type, template_id, target |
| `auto_message_logs` | Sent auto-messages | client_id, coach_id, message_content |
| `community_posts` | Social posts | author_id, content, post_type, media |
| `community_comments` | Post comments | post_id, author_id, content |
| `community_likes` | Post likes | post_id, user_id |
| `community_saved_posts` | Bookmarked posts | post_id, user_id |
| `community_reports` | Reported content | post_id, reporter_id, reason |
| `community_user_stats` | Engagement metrics | user_id, total_posts, streaks, badges |
| `culture_profiles` | Identity tier data | user_id, tier, streaks, lifetime_avg |
| `culture_badges` | Earned badges | user_id, badge_type, week_start |
| `culture_messages` | Coach culture messages | coach_id, content, week_start |
| `culture_spotlights` | Coach spotlights | coach_id, user_id, spotlight_type |
| `document_templates` | Contract/agreement templates | template_key, tier_applicability, body |
| `client_signatures` | Signature records | client_id, document_template_id, signed_name, ip_address |
| `legal_documents` | Legal document versions | document_type, version_number, content |
| `legal_acceptances` | Legal acceptance records | user_id, document_id, ip_address |
| `deletion_requests` | Account deletion requests | user_id, email, status, token |
| `admin_tool_runs` | Admin tool audit log | tool_name, ran_by, repaired_count |
| `water_logs` | Water intake tracking | client_id, amount_ml, logged_at |

---

## 6. EDGE FUNCTIONS

| Function | Purpose |
|----------|---------|
| `validate-invite-token` | Client invite validation + auto-accept + setup (account creation) |
| `send-client-invite` | Send client invitation email |
| `resend-client-invite` | Resend expired/pending client invite |
| `staff-invite` | Staff invite send/validate/accept |
| `search-foods` | Food search across local DB + external APIs |
| `usda-food-search` | USDA FoodData Central API search |
| `open-food-facts-search` | Open Food Facts API search |
| `barcode-lookup` | Barcode → food item lookup |
| `seed-foods` | Seed ~500 staple foods from USDA |
| `meal-scan` | AI-powered meal photo → macro estimation |
| `analyze-supplement-label` | AI supplement label analysis |
| `estimate-body-fat` | AI body fat estimation from photos |
| `progress-insights` | AI-generated progress analysis |
| `calculate-culture-scores` | Weekly culture engine calculations |
| `calculate-risk-scores` | Client risk/churn scoring |
| `evaluate-auto-messages` | Process automated messaging triggers |
| `sync-wearable-steps` | Single-user wearable step sync |
| `sync-wearable-steps-batch` | Batch wearable step sync |
| `request-account-deletion` | Initiate GDPR deletion |
| `confirm-account-deletion` | Confirm and execute deletion |

---

## 7. CUSTOM HOOKS

| Hook | Purpose |
|------|---------|
| `useAuth` | Session, user, role, roles[], hasRole(), signOut. Role caching in sessionStorage. |
| `useActiveSession` | Detect unfinished workout sessions |
| `useCommunity` | Community posts CRUD + realtime |
| `useCulture` | Culture engine data fetching |
| `useDataFetch` | Generic data fetcher with caching, timeout, stale-while-revalidate |
| `useFoodSearch` | Food search across multiple sources |
| `useHealthKit` | Apple Health / Google Fit integration |
| `useHealthSync` | Wearable data synchronization |
| `useLoggingStreak` | Nutrition logging streak calculation |
| `useMealPlanTracker` | Meal plan compliance tracking |
| `useOptimistic` | Optimistic UI updates |
| `useQuickAddMeals` | Quick-add previous meals |
| `useTDEE` | TDEE calculation engine |
| `useTimedLoader` | Loading state with minimum display time |
| `useWorkoutStreak` | Workout completion streak |
| `use-mobile` | Mobile viewport detection |
| `use-toast` | Toast notification system |

---

## 8. SERVICES & UTILITIES

| File | Purpose |
|------|---------|
| `services/foodSearchService.ts` | Multi-source food search orchestration |
| `services/mealTemplateService.ts` | Meal template CRUD |
| `services/openFoodFacts.ts` | OFF API client |
| `utils/barcodeService.ts` | ZXing barcode scanning |
| `utils/displayPosition.ts` | Workout day numbering logic |
| `utils/foodEmoji.ts` | Food category → emoji mapping |
| `utils/localDate.ts` | Timezone-aware date utilities |
| `utils/workoutLabel.ts` | Workout day label formatting |
| `lib/foodIcons.tsx` | Food category icon components |
| `lib/micronutrients.ts` | Micronutrient reference data |
| `lib/performance.ts` | Timeout constants + withTimeout utility |
| `lib/utils.ts` | cn() + general utilities |

---

## 9. PRODUCTION RESILIENCE

1. **ErrorBoundary** — wraps entire app, shows styled error UI with reload
2. **Environment guard** — `main.tsx` checks for Supabase env vars before mounting
3. **Service worker killer** — inline script in `index.html` unregisters all SW + clears caches
4. **Cache-Control headers** — `public/_headers` prevents caching of index.html, sw.js, JS bundles
5. **Auth stall detection** — `ProtectedRoute` shows recovery UI after 8s auth hydration timeout
6. **Role caching** — `sessionStorage` caches roles to avoid blank screens on refresh

---

## 10. MOBILE (Capacitor)

- `capacitor.config.ts` configured for iOS/Android
- Health integrations via `@capacitor` plugins
- PWA manifest at `/manifest.json`
- Apple touch icon, splash screens
- `PWAInstallPrompt` component

---

## 11. DESIGN SYSTEM

| Token | Value |
|-------|-------|
| Background | `#0a0a0a` |
| Foreground | `#e5e0d5` |
| Primary (Gold) | `#D4A017` |
| Card | Dark elevated surface |
| Border | Subtle dark borders |
| Font Display | Custom display font |
| Font Body | Inter / system |

All colors use HSL via CSS variables. Semantic tokens: `--background`, `--foreground`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`.

---

_End of audit. This document captures every feature, route, table, function, and integration in the Physique Crafters OS codebase as of 2026-03-11._
