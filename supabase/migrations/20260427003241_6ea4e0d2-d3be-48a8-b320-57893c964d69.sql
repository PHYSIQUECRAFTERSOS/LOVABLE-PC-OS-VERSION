
-- Trigram index on exercises.name for fast fuzzy candidate lookup
CREATE INDEX IF NOT EXISTS idx_exercises_name_trgm
  ON public.exercises USING gin (name gin_trgm_ops);

-- Synonyms / abbreviations table for exercise matching
CREATE TABLE IF NOT EXISTS public.exercise_synonyms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term text NOT NULL,
  canonical text NOT NULL,
  weight smallint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exercise_synonyms_term_canonical_unique UNIQUE (term, canonical)
);
CREATE INDEX IF NOT EXISTS idx_exercise_synonyms_term ON public.exercise_synonyms (lower(term));

ALTER TABLE public.exercise_synonyms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authed can read exercise_synonyms" ON public.exercise_synonyms;
CREATE POLICY "Anyone authed can read exercise_synonyms"
  ON public.exercise_synonyms FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins manage exercise_synonyms" ON public.exercise_synonyms;
CREATE POLICY "Admins manage exercise_synonyms"
  ON public.exercise_synonyms FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Remembered manual mappings from PDF-extracted strings to library exercise IDs
CREATE TABLE IF NOT EXISTS public.exercise_extraction_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extracted_name text NOT NULL,
  normalized_name text NOT NULL,
  exercise_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  hit_count int NOT NULL DEFAULT 1,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exercise_extraction_aliases_unique UNIQUE (normalized_name, exercise_id)
);
CREATE INDEX IF NOT EXISTS idx_exercise_aliases_normalized
  ON public.exercise_extraction_aliases (normalized_name);

ALTER TABLE public.exercise_extraction_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches and admins read aliases" ON public.exercise_extraction_aliases;
CREATE POLICY "Coaches and admins read aliases"
  ON public.exercise_extraction_aliases FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Coaches and admins insert aliases" ON public.exercise_extraction_aliases;
CREATE POLICY "Coaches and admins insert aliases"
  ON public.exercise_extraction_aliases FOR INSERT
  TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin'))
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Coaches and admins update aliases" ON public.exercise_extraction_aliases;
CREATE POLICY "Coaches and admins update aliases"
  ON public.exercise_extraction_aliases FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins delete aliases" ON public.exercise_extraction_aliases;
CREATE POLICY "Admins delete aliases"
  ON public.exercise_extraction_aliases FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Seed common fitness abbreviations / synonyms
INSERT INTO public.exercise_synonyms (term, canonical) VALUES
  ('db', 'dumbbell'),
  ('dbs', 'dumbbell'),
  ('bb', 'barbell'),
  ('kb', 'kettlebell'),
  ('dl', 'deadlift'),
  ('rdl', 'romanian deadlift'),
  ('sldl', 'stiff leg deadlift'),
  ('ohp', 'overhead press'),
  ('bp', 'bench press'),
  ('pulldown', 'pull down'),
  ('pull-down', 'pull down'),
  ('pushdown', 'push down'),
  ('push-down', 'push down'),
  ('lat raise', 'lateral raise'),
  ('side raise', 'lateral raise'),
  ('lat', 'lateral'),
  ('tri', 'tricep'),
  ('tris', 'tricep'),
  ('bi', 'bicep'),
  ('bis', 'bicep'),
  ('ext', 'extension'),
  ('extn', 'extension'),
  ('ext.', 'extension'),
  ('hip thrust', 'hip thrusts'),
  ('hammies', 'hamstrings'),
  ('quads', 'quadriceps'),
  ('glutes', 'gluteus'),
  ('cg', 'close grip'),
  ('wg', 'wide grip'),
  ('rg', 'reverse grip'),
  ('ng', 'neutral grip'),
  ('sa', 'single arm'),
  ('sl', 'single leg'),
  ('bw', 'bodyweight'),
  ('smith', 'smith machine'),
  ('cable fly', 'cable flye'),
  ('flye', 'fly')
ON CONFLICT (term, canonical) DO NOTHING;
