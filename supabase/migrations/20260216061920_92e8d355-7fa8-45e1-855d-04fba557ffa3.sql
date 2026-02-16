
-- Weekly Compliance Scores (snapshot per user per week)
CREATE TABLE public.weekly_compliance_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  week_start date NOT NULL,
  workout_pct numeric NOT NULL DEFAULT 0,
  nutrition_pct numeric NOT NULL DEFAULT 0,
  checkin_completed boolean NOT NULL DEFAULT false,
  community_post_count integer NOT NULL DEFAULT 0,
  total_score numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, week_start)
);

ALTER TABLE public.weekly_compliance_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own compliance scores"
  ON public.weekly_compliance_scores FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Coaches can view all compliance scores"
  ON public.weekly_compliance_scores FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert compliance scores"
  ON public.weekly_compliance_scores FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can update compliance scores"
  ON public.weekly_compliance_scores FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Culture Badges (permanent, date-stamped)
CREATE TABLE public.culture_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  badge_type text NOT NULL, -- weekly_champion, most_improved, comeback, reset, consistency, elite_week, featured_performer
  week_start date NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, badge_type, week_start)
);

ALTER TABLE public.culture_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view badges"
  ON public.culture_badges FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Coaches can manage badges"
  ON public.culture_badges FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Coaches can delete badges"
  ON public.culture_badges FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Culture Spotlights (coach-selected weekly)
CREATE TABLE public.culture_spotlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  user_id uuid NOT NULL,
  spotlight_type text NOT NULL, -- high_performer, most_improved, comeback
  week_start date NOT NULL,
  message text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(spotlight_type, week_start)
);

ALTER TABLE public.culture_spotlights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view spotlights"
  ON public.culture_spotlights FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Coaches can manage spotlights"
  ON public.culture_spotlights FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Culture Profiles (aggregated per user)
CREATE TABLE public.culture_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  tier text NOT NULL DEFAULT 'bronze', -- bronze, silver, gold, elite
  total_elite_weeks integer NOT NULL DEFAULT 0,
  most_improved_count integer NOT NULL DEFAULT 0,
  comeback_count integer NOT NULL DEFAULT 0,
  reset_count integer NOT NULL DEFAULT 0,
  current_streak integer NOT NULL DEFAULT 0,
  longest_streak integer NOT NULL DEFAULT 0,
  lifetime_avg numeric NOT NULL DEFAULT 0,
  consistency_active boolean NOT NULL DEFAULT false,
  consistency_weeks integer NOT NULL DEFAULT 0,
  below_70_weeks integer NOT NULL DEFAULT 0,
  reset_week_active boolean NOT NULL DEFAULT false,
  reset_week_eligible boolean NOT NULL DEFAULT false,
  below_60_weeks integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.culture_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view culture profiles"
  ON public.culture_profiles FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "System can upsert culture profiles"
  ON public.culture_profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can update culture profiles"
  ON public.culture_profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Culture Messages (coach weekly messages)
CREATE TABLE public.culture_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  content text NOT NULL,
  week_start date NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.culture_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view culture messages"
  ON public.culture_messages FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Coaches can manage culture messages"
  ON public.culture_messages FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at on culture_profiles
CREATE TRIGGER update_culture_profiles_updated_at
  BEFORE UPDATE ON public.culture_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for leaderboard-relevant tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.culture_badges;
ALTER PUBLICATION supabase_realtime ADD TABLE public.culture_spotlights;
