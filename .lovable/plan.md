

# Physique Crafters — Transformation Operating System

## Brand & Design System
- Dark mode only with matte black background, subtle gold accents
- Clean sans-serif typography, premium biotech aesthetic
- Masculine, sharp, minimal navigation — no clutter
- Tagline: "The Triple O Method" featured throughout
- Custom icon set (no cartoonish icons)

---

## Phase 1 — MVP (Core Platform)

### 1. Authentication & Onboarding
- Secure login/signup with email (Supabase Auth)
- Role-based access: **Admin**, **Coach**, **Client**
- Client onboarding flow with contract e-sign agreement
- Coach invitation system (small team of 2-5 coaches)

### 2. Coach Dashboard
- Overview of all assigned clients with status indicators
- Client compliance %, training streaks, macro adherence at a glance
- Ability to assign/edit workouts and nutrition plans in real-time
- Quick access to messaging and check-in reviews

### 3. Client Dashboard
- Today's workout, macros remaining, daily check-in prompt
- Progress stats (weight trend, streaks, compliance score)
- Quick navigation to training, nutrition, and messaging

### 4. Training System
- **Workout Builder** (Coach): Create custom workouts with exercises, sets, reps, tempo, RIR, rest periods, and notes
- **Exercise Database**: Searchable library with uploaded video demos (Supabase Storage)
- **Client Logging**: Log weight, reps, tempo, RIR per set with real-time sync to coach
- **PR Tracking**: Automatic personal record detection per exercise
- **Rest Timer**: Built-in countdown timer during workouts
- **Templates**: Duplicate and assign workout templates, organize by periodization phases
- **Exercise Swap Suggestions**: Coach can suggest alternative exercises
- **Progression Suggestions**: Automatic recommendations based on logged performance

### 5. Nutrition System
- **Macro Tracker**: Daily calorie/protein/carb/fat logging against targets
- **Meal Plan Builder** (Coach): Create and assign custom meal plans
- **Food Database**: Searchable food database for quick logging
- **Coach Controls**: Push macro target updates instantly, toggle refeed/high days
- **Compliance Tracking**: Weekly macro adherence %, average weekly intake view
- **Water & Supplement Tracking**: Daily water intake and supplement checklist

### 6. Basic Biofeedback System
- **Weekly Check-In Form**: Weight, sleep, stress, energy, digestion, libido, mood ratings
- **Progress Photos**: Secure upload and timeline view (Supabase Storage)
- **Circumference Measurements**: Track body measurements over time
- **Weight Tracking**: Daily/weekly weight with trend visualization
- **Dashboard**: Charts showing trends over time for all biofeedback metrics

### 7. Messaging
- **In-App Chat**: Real-time 1-on-1 messaging between coach and client
- **Message Read Receipts**: See when messages are read
- **Broadcast Announcements**: Coach can send announcements to all clients
- **Group Chat**: Team-wide or group conversations

### 8. Payments (Stripe Integration)
- Payment plans and one-time purchases
- Tiered membership options
- Client payment status tracking
- Revenue dashboard for admin
- Cancellation request form (no auto-renewals)

### 9. Admin Panel
- View all coaches and clients
- Retention rate, churn rate, compliance rate, engagement rate
- Most active clients and at-risk client flagging
- Send bulk notifications
- Average program duration tracking

### 10. App Store Distribution
- Capacitor wrapper for iOS and Android
- App Store and Google Play submission-ready build

---

## Phase 2 — Advanced Features

### 11. Gamification & Identity System
- Leaderboards (steps, workout streaks, compliance)
- Streak tracking with visual indicators
- Habit compliance scoring
- Monthly challenge system
- Badges and milestone unlocks
- Transformation Levels 1–10 progression
- Public recognition wall inside app

### 12. Advanced Communication
- Voice note messages
- Video reply messages
- Push notification reminders (Capacitor Push Notifications)

### 13. Deep Analytics & Risk Flagging
- Advanced trend analysis across all biofeedback metrics
- Risk flag system: auto-flag clients when metrics drop
- Detailed engagement scoring
- Coach performance analytics

### 14. Apple Health Integration
- Sync weight, steps, and sleep data from Apple Health
- Step tracking leaderboard integration

### 15. Barcode Scanner
- Scan food barcodes for quick nutrition logging

---

## Technical Architecture
- **Frontend**: React + TypeScript + Tailwind CSS (Capacitor for native)
- **Backend**: Lovable Cloud (Supabase) — database, auth, storage, edge functions
- **Payments**: Stripe integration
- **Real-time**: Supabase Realtime for live data sync and messaging
- **Storage**: Supabase Storage for exercise videos, progress photos
- **Multi-coach support**: Role-based access for admin, coaches, and clients

