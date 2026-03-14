
-- Challenges & Gamification Schema

-- 1. Badges table
CREATE TABLE IF NOT EXISTS public.badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  icon text NOT NULL DEFAULT '🏆',
  category text DEFAULT 'challenge',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;

-- 2. Tiers table
CREATE TABLE IF NOT EXISTS public.tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  min_xp integer NOT NULL DEFAULT 0,
  color text NOT NULL DEFAULT '#CD7F32',
  icon text,
  sort_order integer NOT NULL DEFAULT 0
);
ALTER TABLE public.tiers ENABLE ROW LEVEL SECURITY;

-- 3. Challenges table
CREATE TABLE IF NOT EXISTS public.challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  title text NOT NULL,
  description text,
  challenge_type text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  start_date date NOT NULL,
  end_date date NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  xp_reward integer NOT NULL DEFAULT 100,
  badge_id uuid REFERENCES public.badges(id) ON DELETE SET NULL,
  max_participants integer,
  visibility text DEFAULT 'all',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

-- 4. Challenge participants
CREATE TABLE IF NOT EXISTS public.challenge_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  joined_at timestamptz DEFAULT now(),
  status text DEFAULT 'active',
  current_value numeric DEFAULT 0,
  best_value numeric DEFAULT 0,
  xp_earned integer DEFAULT 0,
  completed_at timestamptz,
  rank integer,
  UNIQUE(challenge_id, user_id)
);
ALTER TABLE public.challenge_participants ENABLE ROW LEVEL SECURITY;

-- 5. Challenge logs
CREATE TABLE IF NOT EXISTS public.challenge_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  log_date date NOT NULL,
  value numeric NOT NULL,
  source text DEFAULT 'manual',
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.challenge_logs ENABLE ROW LEVEL SECURITY;

-- 6. XP Ledger
CREATE TABLE IF NOT EXISTS public.xp_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount integer NOT NULL,
  source_type text NOT NULL,
  source_id uuid,
  description text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.xp_ledger ENABLE ROW LEVEL SECURITY;

-- 7. User badges
CREATE TABLE IF NOT EXISTS public.user_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  badge_id uuid NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  earned_at timestamptz DEFAULT now(),
  source_challenge_id uuid REFERENCES public.challenges(id) ON DELETE SET NULL,
  UNIQUE(user_id, badge_id)
);
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

-- 8. User XP Summary
CREATE TABLE IF NOT EXISTS public.user_xp_summary (
  user_id uuid PRIMARY KEY,
  total_xp integer DEFAULT 0,
  current_tier_id uuid REFERENCES public.tiers(id),
  elite_weeks integer DEFAULT 0,
  current_streak integer DEFAULT 0,
  longest_streak integer DEFAULT 0,
  comebacks integer DEFAULT 0,
  resets integer DEFAULT 0,
  lifetime_avg_pct numeric DEFAULT 0
);
ALTER TABLE public.user_xp_summary ENABLE ROW LEVEL SECURITY;

-- =====================
-- RLS POLICIES
-- =====================

-- Badges
CREATE POLICY "Anyone can read badges" ON public.badges FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage badges" ON public.badges FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Tiers
CREATE POLICY "Anyone can read tiers" ON public.tiers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage tiers" ON public.tiers FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Challenges
CREATE POLICY "Read published challenges" ON public.challenges FOR SELECT TO authenticated
  USING (status != 'draft' OR created_by = auth.uid());
CREATE POLICY "Admin coach create challenges" ON public.challenges FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'coach'));
CREATE POLICY "Creator can update challenges" ON public.challenges FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can delete challenges" ON public.challenges FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Challenge participants
CREATE POLICY "Read challenge participants" ON public.challenge_participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "Join challenge" ON public.challenge_participants FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Update own participation" ON public.challenge_participants FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'coach'));

-- Challenge logs
CREATE POLICY "Read challenge logs" ON public.challenge_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert own logs" ON public.challenge_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- XP Ledger
CREATE POLICY "Read own xp" ON public.xp_ledger FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'coach'));
CREATE POLICY "System insert xp" ON public.xp_ledger FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'coach'));

-- User badges
CREATE POLICY "Read user badges" ON public.user_badges FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert user badges" ON public.user_badges FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'coach'));

-- User XP Summary
CREATE POLICY "Read xp summary" ON public.user_xp_summary FOR SELECT TO authenticated USING (true);
CREATE POLICY "Upsert own xp summary" ON public.user_xp_summary FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'coach'));
CREATE POLICY "Update xp summary" ON public.user_xp_summary FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'coach'));

-- Updated_at trigger for challenges
CREATE TRIGGER update_challenges_updated_at
  BEFORE UPDATE ON public.challenges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
