
-- Course Modules table
CREATE TABLE IF NOT EXISTS public.course_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_modules TO authenticated;
GRANT ALL ON public.course_modules TO service_role;
ALTER TABLE public.course_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Modules viewable by authenticated"
  ON public.course_modules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Coaches/admins can insert modules"
  ON public.course_modules FOR INSERT TO authenticated
  WITH CHECK (public.has_role((select auth.uid()), 'coach') OR public.has_role((select auth.uid()), 'admin'));
CREATE POLICY "Coaches/admins can update modules"
  ON public.course_modules FOR UPDATE TO authenticated
  USING (public.has_role((select auth.uid()), 'coach') OR public.has_role((select auth.uid()), 'admin'));
CREATE POLICY "Admins can delete modules"
  ON public.course_modules FOR DELETE TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'));

-- Courses table
CREATE TABLE IF NOT EXISTS public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  youtube_url TEXT NOT NULL,
  youtube_video_id TEXT NOT NULL,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  description TEXT,
  module_id UUID REFERENCES public.course_modules(id) ON DELETE SET NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT ALL ON public.courses TO service_role;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Courses viewable by authenticated"
  ON public.courses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Coaches/admins can insert courses"
  ON public.courses FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role((select auth.uid()), 'coach') OR public.has_role((select auth.uid()), 'admin'))
    AND created_by = (select auth.uid())
  );
CREATE POLICY "Creator or admin can update courses"
  ON public.courses FOR UPDATE TO authenticated
  USING (created_by = (select auth.uid()) OR public.has_role((select auth.uid()), 'admin'));
CREATE POLICY "Creator or admin can delete courses"
  ON public.courses FOR DELETE TO authenticated
  USING (created_by = (select auth.uid()) OR public.has_role((select auth.uid()), 'admin'));

CREATE INDEX IF NOT EXISTS idx_courses_posted_at ON public.courses(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_courses_module_id ON public.courses(module_id);
CREATE INDEX IF NOT EXISTS idx_courses_is_pinned ON public.courses(is_pinned) WHERE is_pinned = true;

-- Course watches
CREATE TABLE IF NOT EXISTS public.course_watches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  watched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (course_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_watches TO authenticated;
GRANT ALL ON public.course_watches TO service_role;
ALTER TABLE public.course_watches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own watches"
  ON public.course_watches FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));
CREATE POLICY "Users insert own watches"
  ON public.course_watches FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Users update own watches"
  ON public.course_watches FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()));
CREATE POLICY "Users delete own watches"
  ON public.course_watches FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

CREATE INDEX IF NOT EXISTS idx_course_watches_user ON public.course_watches(user_id);

-- Updated_at trigger reuse
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_course_modules_updated ON public.course_modules;
CREATE TRIGGER trg_course_modules_updated BEFORE UPDATE ON public.course_modules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_courses_updated ON public.courses;
CREATE TRIGGER trg_courses_updated BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed starter modules
INSERT INTO public.course_modules (name, sort_order) VALUES
  ('Start Here', 0),
  ('Nutrition', 1),
  ('Training', 2),
  ('Mindset', 3),
  ('Q&A', 4)
ON CONFLICT DO NOTHING;
