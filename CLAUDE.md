# Physique Crafters — Claude Code Workspace

## Stack
- **Frontend**: React + Vite + TypeScript + Tailwind + shadcn/ui
- **Database**: Supabase (PostgreSQL + Row Level Security)
- **Hosting**: Vercel → `app.physiquecrafters.com` (auto-deploys from `main` branch)
- **Mobile**: Capacitor (iOS/Android wrapper)

## ⚡ Automated Workflow — No Manual Steps Required

### Deploying code to production
After making and committing changes, run:
```bash
./scripts/deploy.sh
```
This merges the current branch into GitHub `main` → Vercel auto-redeploys in ~2 min.
Live at: https://app.physiquecrafters.com

### Running database migrations (SQL changes)
```bash
./scripts/db-push.sh                          # run all migrations
./scripts/db-push.sh supabase/migrations/foo.sql  # run one file
```
All SQL migrations live in `supabase/migrations/`. Create a new `.sql` file there and run the command — no Supabase dashboard needed.

### Full feature workflow (the only steps needed)
1. Write/edit code
2. `git add` + `git commit`
3. `git push -u origin claude/<branch-name>` (required by system)
4. `./scripts/deploy.sh` → pushes to GitHub main → Vercel deploys
5. If SQL changes: `./scripts/db-push.sh` → applies to Supabase directly

---

## Environment Variables
All credentials are in `.env` (gitignored — never committed).

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL for the app |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key (public) |
| `GITHUB_TOKEN` | GitHub PAT for pushing to main |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin key for running SQL |
| `SUPABASE_PROJECT_ID_SERVICE` | Supabase project ID (`ifknsfzawgpzsszaugxf`) |

All Supabase references point to the single production project: `ifknsfzawgpzsszaugxf`

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
  migrations/       # SQL files — run via ./scripts/db-push.sh
scripts/
  deploy.sh         # Push to GitHub main → Vercel deploys
  db-push.sh        # Run SQL migrations against Supabase
```

## Git Rules
- System requires pushing to `claude/<branch>` via the proxy remote
- `./scripts/deploy.sh` handles pushing to GitHub `main` separately
- Never push secrets or `.env` to any branch

## Key Supabase Patterns
- All tables use RLS (Row Level Security)
- Helper function: `public.has_role(user_id, role_name)` for role checks
- Migrations go in `supabase/migrations/` with timestamp prefix: `YYYYMMDDHHMMSS_description.sql`
