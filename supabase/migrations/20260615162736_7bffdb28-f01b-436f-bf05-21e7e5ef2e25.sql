CREATE TABLE IF NOT EXISTS public.client_exercise_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  note text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (client_id, exercise_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_exercise_notes TO authenticated;
GRANT ALL ON public.client_exercise_notes TO service_role;

ALTER TABLE public.client_exercise_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients manage their own exercise notes"
  ON public.client_exercise_notes
  FOR ALL
  TO authenticated
  USING (auth.uid() = client_id)
  WITH CHECK (auth.uid() = client_id);

CREATE INDEX IF NOT EXISTS idx_client_exercise_notes_client
  ON public.client_exercise_notes(client_id);

CREATE TRIGGER update_client_exercise_notes_updated_at
  BEFORE UPDATE ON public.client_exercise_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();