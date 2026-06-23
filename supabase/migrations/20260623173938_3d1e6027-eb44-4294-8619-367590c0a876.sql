
-- 1. Extend badges catalog
ALTER TABLE public.badges
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS threshold integer,
  ADD COLUMN IF NOT EXISTS tier text,
  ADD COLUMN IF NOT EXISTS lucide_icon text;

CREATE UNIQUE INDEX IF NOT EXISTS badges_category_threshold_uniq
  ON public.badges (category, threshold)
  WHERE category IS NOT NULL AND threshold IS NOT NULL;

-- 2. Progress cache
CREATE TABLE IF NOT EXISTS public.client_milestone_progress (
  client_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  workouts_completed integer NOT NULL DEFAULT 0,
  cardio_completed integer NOT NULL DEFAULT 0,
  nutrition_days_total integer NOT NULL DEFAULT 0,
  nutrition_current_streak integer NOT NULL DEFAULT 0,
  nutrition_longest_streak integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_milestone_progress TO authenticated;
GRANT ALL ON public.client_milestone_progress TO service_role;
ALTER TABLE public.client_milestone_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client reads own progress" ON public.client_milestone_progress;
CREATE POLICY "client reads own progress" ON public.client_milestone_progress
  FOR SELECT TO authenticated
  USING (client_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'coach'));
DROP POLICY IF EXISTS "client upserts own progress" ON public.client_milestone_progress;
CREATE POLICY "client upserts own progress" ON public.client_milestone_progress
  FOR INSERT TO authenticated
  WITH CHECK (client_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "client updates own progress" ON public.client_milestone_progress;
CREATE POLICY "client updates own progress" ON public.client_milestone_progress
  FOR UPDATE TO authenticated
  USING (client_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (client_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 3. Unlock log
CREATE TABLE IF NOT EXISTS public.client_milestone_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id uuid NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  category text NOT NULL,
  threshold integer NOT NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  celebrated_at timestamptz,
  UNIQUE (client_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_milestone_unlocks_client
  ON public.client_milestone_unlocks (client_id, celebrated_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_milestone_unlocks TO authenticated;
GRANT ALL ON public.client_milestone_unlocks TO service_role;
ALTER TABLE public.client_milestone_unlocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client reads own unlocks" ON public.client_milestone_unlocks;
CREATE POLICY "client reads own unlocks" ON public.client_milestone_unlocks
  FOR SELECT TO authenticated
  USING (client_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'coach'));
DROP POLICY IF EXISTS "client inserts own unlocks" ON public.client_milestone_unlocks;
CREATE POLICY "client inserts own unlocks" ON public.client_milestone_unlocks
  FOR INSERT TO authenticated
  WITH CHECK (client_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'coach'));
DROP POLICY IF EXISTS "client updates own unlocks" ON public.client_milestone_unlocks;
CREATE POLICY "client updates own unlocks" ON public.client_milestone_unlocks
  FOR UPDATE TO authenticated
  USING (client_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (client_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 4. Seed milestone badges
INSERT INTO public.badges (name, description, icon, category, threshold, tier, lucide_icon)
VALUES
  ('First Rep',       'You showed up. The journey starts.',      '🏋️', 'workout_count',    1,    'bronze',   'Dumbbell'),
  ('Tenacious 10',    '10 workouts in the books.',               '🏋️', 'workout_count',    10,   'bronze',   'Dumbbell'),
  ('Quarter Century', '25 workouts crushed.',                    '🏋️', 'workout_count',    25,   'bronze',   'Dumbbell'),
  ('Half a Hundred',  '50 workouts. Habit forming.',             '🏋️', 'workout_count',    50,   'silver',   'Dumbbell'),
  ('Lucky 75',        '75 workouts. Locked in.',                 '🏋️', 'workout_count',    75,   'silver',   'Dumbbell'),
  ('Century Club',    '100 workouts. Elite consistency.',        '🏆', 'workout_count',    100,  'gold',     'Trophy'),
  ('250 Strong',      '250 workouts. Built different.',          '🏆', 'workout_count',    250,  'gold',     'Trophy'),
  ('500 Legend',      '500 workouts. A force of nature.',        '👑', 'workout_count',    500,  'platinum', 'Crown'),
  ('750 Beast',       '750 workouts. Untouchable discipline.',   '👑', 'workout_count',    750,  'platinum', 'Crown'),
  ('1000 Immortal',   '1000 workouts. Hall of Fame.',            '💎', 'workout_count',    1000, 'diamond',  'Gem'),
  ('First Mile',      'First cardio session logged.',            '❤️', 'cardio_count',     1,    'bronze',   'Heart'),
  ('Cardio 25',       '25 cardio sessions done.',                '❤️', 'cardio_count',     25,   'bronze',   'Heart'),
  ('Cardio 50',       '50 cardio sessions. Engine building.',    '❤️', 'cardio_count',     50,   'silver',   'Heart'),
  ('Cardio Century',  '100 cardio sessions. Heart of a runner.', '❤️', 'cardio_count',     100,  'gold',     'Heart'),
  ('Cardio 250',      '250 cardio sessions. Unstoppable.',       '❤️', 'cardio_count',     250,  'gold',     'Heart'),
  ('Cardio 500',      '500 cardio sessions. Elite engine.',      '🔥', 'cardio_count',     500,  'platinum', 'Flame'),
  ('Cardio 750',      '750 cardio sessions. Endurance legend.',  '🔥', 'cardio_count',     750,  'platinum', 'Flame'),
  ('Cardio Immortal', '1000 cardio sessions. The pinnacle.',     '💎', 'cardio_count',     1000, 'diamond',  'Gem'),
  ('Week One',        '7 days of nutrition logged.',             '🍎', 'nutrition_total',  7,    'bronze',   'Apple'),
  ('30 Days In',      '30 days of nutrition logged.',            '🍎', 'nutrition_total',  30,   'bronze',   'Apple'),
  ('Hundred Days',    '100 days of nutrition logged.',           '🍎', 'nutrition_total',  100,  'silver',   'Apple'),
  ('250 Days Dialed', '250 days of nutrition logged.',           '🍎', 'nutrition_total',  250,  'gold',     'Apple'),
  ('500 Days Dialed', '500 days of nutrition logged.',           '🍎', 'nutrition_total',  500,  'platinum', 'Apple'),
  ('1000 Day Diary',  '1000 days of nutrition logged.',          '💎', 'nutrition_total',  1000, 'diamond',  'Gem'),
  ('7 Day Streak',    '7 days logged in a row.',                 '🔥', 'nutrition_streak', 7,    'bronze',   'Flame'),
  ('14 Day Streak',   '14 days logged in a row.',                '🔥', 'nutrition_streak', 14,   'bronze',   'Flame'),
  ('30 Day Streak',   '30 days logged in a row. Locked in.',     '🔥', 'nutrition_streak', 30,   'silver',   'Flame'),
  ('60 Day Streak',   '60 days logged in a row.',                '🔥', 'nutrition_streak', 60,   'silver',   'Flame'),
  ('100 Day Streak',  '100 days logged in a row. Elite.',        '🔥', 'nutrition_streak', 100,  'gold',     'Flame'),
  ('180 Day Streak',  '180 days logged in a row.',               '🔥', 'nutrition_streak', 180,  'platinum', 'Flame'),
  ('365 Day Streak',  'A full year logged. Untouchable.',        '💎', 'nutrition_streak', 365,  'diamond',  'Gem')
ON CONFLICT DO NOTHING;

-- 5. Streak helper
CREATE OR REPLACE FUNCTION public.compute_nutrition_streak(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  streak int := 0;
  check_date date := current_date;
  has_log bool;
BEGIN
  SELECT EXISTS (SELECT 1 FROM nutrition_logs WHERE client_id = p_user_id AND logged_at = check_date) INTO has_log;
  IF NOT has_log THEN check_date := check_date - 1; END IF;
  LOOP
    SELECT EXISTS (SELECT 1 FROM nutrition_logs WHERE client_id = p_user_id AND logged_at = check_date) INTO has_log;
    IF has_log THEN
      streak := streak + 1;
      check_date := check_date - 1;
    ELSE EXIT;
    END IF;
  END LOOP;
  RETURN streak;
END;
$$;

-- 6. Recompute + unlock function. Returns rows for any NEWLY inserted unlocks.
CREATE OR REPLACE FUNCTION public.recompute_milestones(p_user_id uuid, p_silent boolean DEFAULT false)
RETURNS TABLE (out_badge_id uuid, out_category text, out_threshold integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_workouts int;
  v_cardio int;
  v_nut_days int;
  v_nut_streak int;
  v_nut_longest int;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;

  SELECT COUNT(*)::int INTO v_workouts
  FROM workout_sessions ws
  LEFT JOIN workouts w ON w.id = ws.workout_id
  WHERE ws.client_id = p_user_id
    AND ws.status = 'completed'
    AND COALESCE(w.is_accessory, false) = false;

  SELECT COUNT(*)::int INTO v_cardio
  FROM cardio_logs WHERE client_id = p_user_id AND completed = true;

  SELECT COUNT(DISTINCT logged_at)::int INTO v_nut_days
  FROM nutrition_logs WHERE client_id = p_user_id;

  v_nut_streak := public.compute_nutrition_streak(p_user_id);

  SELECT GREATEST(v_nut_streak, COALESCE(cmp.nutrition_longest_streak, 0))
    INTO v_nut_longest
  FROM client_milestone_progress cmp WHERE cmp.client_id = p_user_id;
  IF v_nut_longest IS NULL THEN v_nut_longest := v_nut_streak; END IF;

  INSERT INTO client_milestone_progress AS cmp (
    client_id, workouts_completed, cardio_completed,
    nutrition_days_total, nutrition_current_streak, nutrition_longest_streak, updated_at
  ) VALUES (
    p_user_id, v_workouts, v_cardio, v_nut_days, v_nut_streak, v_nut_longest, now()
  )
  ON CONFLICT (client_id) DO UPDATE SET
    workouts_completed = EXCLUDED.workouts_completed,
    cardio_completed = EXCLUDED.cardio_completed,
    nutrition_days_total = EXCLUDED.nutrition_days_total,
    nutrition_current_streak = EXCLUDED.nutrition_current_streak,
    nutrition_longest_streak = GREATEST(cmp.nutrition_longest_streak, EXCLUDED.nutrition_current_streak),
    updated_at = now();

  RETURN QUERY
  WITH inserted AS (
    INSERT INTO client_milestone_unlocks (client_id, badge_id, category, threshold, unlocked_at, celebrated_at)
    SELECT
      p_user_id, b.id, b.category, b.threshold, now(),
      CASE WHEN p_silent THEN now() ELSE NULL END
    FROM badges b
    WHERE b.category IS NOT NULL
      AND b.threshold IS NOT NULL
      AND (
        (b.category = 'workout_count'    AND v_workouts    >= b.threshold) OR
        (b.category = 'cardio_count'     AND v_cardio      >= b.threshold) OR
        (b.category = 'nutrition_total'  AND v_nut_days    >= b.threshold) OR
        (b.category = 'nutrition_streak' AND v_nut_longest >= b.threshold)
      )
    ON CONFLICT (client_id, badge_id) DO NOTHING
    RETURNING client_milestone_unlocks.badge_id, client_milestone_unlocks.category, client_milestone_unlocks.threshold
  )
  SELECT i.badge_id, i.category, i.threshold FROM inserted i;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recompute_milestones(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_nutrition_streak(uuid) TO authenticated;

-- 7. Silent backfill
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT client_id FROM (
      SELECT client_id FROM workout_sessions WHERE status = 'completed'
      UNION
      SELECT client_id FROM cardio_logs WHERE completed = true
      UNION
      SELECT client_id FROM nutrition_logs
    ) u
  LOOP
    PERFORM public.recompute_milestones(r.client_id, true);
  END LOOP;
END $$;
