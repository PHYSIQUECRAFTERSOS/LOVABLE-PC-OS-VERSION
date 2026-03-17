
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ranked_profiles') THEN
    CREATE TABLE public.ranked_profiles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
      current_tier TEXT NOT NULL DEFAULT 'bronze',
      current_division INTEGER DEFAULT 5,
      total_xp INTEGER NOT NULL DEFAULT 0,
      current_division_xp INTEGER NOT NULL DEFAULT 0,
      current_streak INTEGER NOT NULL DEFAULT 0,
      longest_streak INTEGER NOT NULL DEFAULT 0,
      last_active_date DATE,
      inactive_days INTEGER NOT NULL DEFAULT 0,
      is_new_client_boost BOOLEAN DEFAULT false,
      new_client_boost_expires TIMESTAMPTZ,
      weekly_xp INTEGER NOT NULL DEFAULT 0,
      weekly_xp_reset_at TIMESTAMPTZ DEFAULT now(),
      last_rank_up_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'xp_transactions') THEN
    CREATE TABLE public.xp_transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      xp_amount INTEGER NOT NULL,
      base_amount INTEGER NOT NULL,
      multiplier NUMERIC(4,2) DEFAULT 1.0,
      transaction_type TEXT NOT NULL,
      description TEXT,
      related_event_id UUID,
      coach_id UUID,
      coach_award_preset TEXT,
      coach_note TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ranked_badges') THEN
    CREATE TABLE public.ranked_badges (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      icon_name TEXT NOT NULL,
      requirement_type TEXT NOT NULL,
      requirement_value JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT now()
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ranked_user_badges') THEN
    CREATE TABLE public.ranked_user_badges (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      badge_id UUID NOT NULL REFERENCES public.ranked_badges(id) ON DELETE CASCADE,
      earned_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(user_id, badge_id)
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ranked_notifications_queue') THEN
    CREATE TABLE public.ranked_notifications_queue (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      notification_type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      data JSONB,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT now(),
      sent_at TIMESTAMPTZ
    );
  END IF;
END $$;

ALTER TABLE public.ranked_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ranked_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ranked_user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ranked_notifications_queue ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ranked_profiles' AND policyname = 'rp_select_all') THEN
    CREATE POLICY "rp_select_all" ON public.ranked_profiles FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ranked_profiles' AND policyname = 'rp_insert_own') THEN
    CREATE POLICY "rp_insert_own" ON public.ranked_profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ranked_profiles' AND policyname = 'rp_update_own') THEN
    CREATE POLICY "rp_update_own" ON public.ranked_profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ranked_profiles' AND policyname = 'rp_insert_coach') THEN
    CREATE POLICY "rp_insert_coach" ON public.ranked_profiles FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.coach_clients cc WHERE cc.coach_id = auth.uid() AND cc.client_id = ranked_profiles.user_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ranked_profiles' AND policyname = 'rp_update_coach') THEN
    CREATE POLICY "rp_update_coach" ON public.ranked_profiles FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.coach_clients cc WHERE cc.coach_id = auth.uid() AND cc.client_id = ranked_profiles.user_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'xp_transactions' AND policyname = 'xt_select_own') THEN
    CREATE POLICY "xt_select_own" ON public.xp_transactions FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'xp_transactions' AND policyname = 'xt_select_coach') THEN
    CREATE POLICY "xt_select_coach" ON public.xp_transactions FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.coach_clients cc WHERE cc.coach_id = auth.uid() AND cc.client_id = xp_transactions.user_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'xp_transactions' AND policyname = 'xt_select_admin') THEN
    CREATE POLICY "xt_select_admin" ON public.xp_transactions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'xp_transactions' AND policyname = 'xt_insert_own') THEN
    CREATE POLICY "xt_insert_own" ON public.xp_transactions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'xp_transactions' AND policyname = 'xt_insert_coach') THEN
    CREATE POLICY "xt_insert_coach" ON public.xp_transactions FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.coach_clients cc WHERE cc.coach_id = auth.uid() AND cc.client_id = xp_transactions.user_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ranked_badges' AND policyname = 'rb_select_all') THEN
    CREATE POLICY "rb_select_all" ON public.ranked_badges FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ranked_user_badges' AND policyname = 'rub_select_own') THEN
    CREATE POLICY "rub_select_own" ON public.ranked_user_badges FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ranked_user_badges' AND policyname = 'rub_select_coach') THEN
    CREATE POLICY "rub_select_coach" ON public.ranked_user_badges FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.coach_clients cc WHERE cc.coach_id = auth.uid() AND cc.client_id = ranked_user_badges.user_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ranked_user_badges' AND policyname = 'rub_select_admin') THEN
    CREATE POLICY "rub_select_admin" ON public.ranked_user_badges FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ranked_user_badges' AND policyname = 'rub_insert_own') THEN
    CREATE POLICY "rub_insert_own" ON public.ranked_user_badges FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ranked_notifications_queue' AND policyname = 'rnq_select_own') THEN
    CREATE POLICY "rnq_select_own" ON public.ranked_notifications_queue FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ranked_notifications_queue' AND policyname = 'rnq_insert_own') THEN
    CREATE POLICY "rnq_insert_own" ON public.ranked_notifications_queue FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rp_total_xp ON public.ranked_profiles(total_xp DESC);
CREATE INDEX IF NOT EXISTS idx_rp_streak ON public.ranked_profiles(current_streak DESC);
CREATE INDEX IF NOT EXISTS idx_rp_weekly_xp ON public.ranked_profiles(weekly_xp DESC);
CREATE INDEX IF NOT EXISTS idx_xt_user_created ON public.xp_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rub_user ON public.ranked_user_badges(user_id);
