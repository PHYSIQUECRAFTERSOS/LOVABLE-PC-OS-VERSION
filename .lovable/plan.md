# Marketing Landing Page at `/info`

Create a public, unauthenticated marketing page at `https://app.physiquecrafters.com/info` that serves as the Apple App Store **Marketing URL**. Designed for conversion and Apple compliance.

## Page Structure

A single-page scroll with these sections:

1. **Hero** -- Bold headline ("Your Body. Your Coach. One App."), subtitle about personalized coaching, and a CTA button linking to my typeform where they can apply  [https://bit.ly/LOSETHEGUT](https://bit.ly/LOSETHEGUT) or `/auth` as fallback). Use the existing screenshots from `public/screenshots/` as a phone mockup visual.
2. **How It Works** -- 3-step visual flow:
  - Step 1: " Apply for coaching , must get accepted" -- Your coach sends you an invite
  - Step 2: "Follow Your Plan" -- Workouts, nutrition, and check-ins assigned by your coach
  - Step 3: "Track & Improve" -- Progress photos, body stats, and ranked challenges
3. **Key Features** -- Grid of 6 feature cards with icons:
  - Personalized Training Programs
  - Nutrition Tracking & Meal Plans
  - Progress Photos & Body Composition
  - Direct Coach Messaging
  - Weekly Check-Ins
  - Ranked Challenges & Leaderboards
4. **App Screenshots** -- Horizontal scrollable gallery using the existing screenshots in `public/screenshots/`
5. **Footer** -- Links to Privacy Policy (`/privacy-policy`), Terms of Service (`/terms-of-service`), Support (`/support`), and copyright line for Physique Crafters LLC.

## Technical Details

### Files to create:

- `**src/pages/Info.tsx**` -- The full marketing landing page. Public route, no auth required. Clean dark-themed design matching the app's existing color palette. Fully responsive (mobile-first for iPhone/iPad).

### Files to modify:

- `**src/App.tsx**` -- Add `<Route path="/info" element={<Info />} />` as a public route (no `ProtectedRoute` wrapper).

### Design approach:

- Uses existing Tailwind theme tokens (`bg-background`, `text-foreground`, `text-primary`, etc.)
- No external dependencies needed -- pure Tailwind + existing UI components (Button, Card)
- Mobile-first responsive layout with `max-w-6xl` container
- Screenshots displayed in rounded phone-frame style containers
- Smooth scroll