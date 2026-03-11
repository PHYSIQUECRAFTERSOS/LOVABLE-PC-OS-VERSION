# Physique Crafters — Claude Code Workspace

## Stack
- **Frontend**: React + Vite + TypeScript + Tailwind + shadcn/ui
- **Database**: Supabase (PostgreSQL + Row Level Security) via Lovable Cloud
- **Hosting**: Lovable → `app.physiquecrafters.com` (publish from Lovable)
- **Mobile**: Capacitor (iOS/Android wrapper)

## Deployment

Publishing is handled through Lovable's built-in publish feature.
Live at: https://app.physiquecrafters.com

### Running database migrations (SQL changes)
Use Lovable Cloud's migration tools or the Cloud View → Run SQL.

---

## Environment Variables
All environment variables are managed automatically by Lovable Cloud.

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL (auto-configured) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key (auto-configured) |

---

## Project Structure
```
src/
  components/
    calendar/       # Scheduling features
    libraries/      # Exercise library
    nutrition/      # Meal logging, macro tracking, AI scanner
    training/       # Programs, workouts
    ui/             # shadcn base components
  integrations/
    supabase/       # client.ts + generated types
supabase/
  migrations/       # SQL files
```

## Key Supabase Patterns
- All tables use RLS (Row Level Security)
- Helper function: `public.has_role(user_id, role_name)` for role checks
- Migrations go in `supabase/migrations/` with timestamp prefix: `YYYYMMDDHHMMSS_description.sql`
