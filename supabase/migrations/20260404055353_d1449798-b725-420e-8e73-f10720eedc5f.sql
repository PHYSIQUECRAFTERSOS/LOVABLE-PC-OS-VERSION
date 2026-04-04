
CREATE TABLE IF NOT EXISTS public.ai_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  client_id uuid,
  status text NOT NULL DEFAULT 'queued',
  document_type text NOT NULL,
  file_names text[] DEFAULT '{}',
  extracted_json jsonb,
  match_results jsonb,
  final_data jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view own import jobs"
  ON public.ai_import_jobs FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Coaches can create import jobs"
  ON public.ai_import_jobs FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "Coaches can update own import jobs"
  ON public.ai_import_jobs FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE TRIGGER update_ai_import_jobs_updated_at
  BEFORE UPDATE ON public.ai_import_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
