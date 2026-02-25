
-- Add version tracking to programs table
ALTER TABLE public.programs 
  ADD COLUMN IF NOT EXISTS version_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_master boolean NOT NULL DEFAULT false;

-- Add master link tracking to client_program_assignments
ALTER TABLE public.client_program_assignments
  ADD COLUMN IF NOT EXISTS is_linked_to_master boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS master_version_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz DEFAULT now();

-- Master program version history
CREATE TABLE public.master_program_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  change_log text,
  updated_by uuid NOT NULL,
  snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_mpv_program ON public.master_program_versions(program_id, version_number DESC);
CREATE INDEX idx_cpa_master_link ON public.client_program_assignments(forked_from_program_id) WHERE is_linked_to_master = true;

-- RLS
ALTER TABLE public.master_program_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view their program versions"
  ON public.master_program_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.programs p
      WHERE p.id = master_program_versions.program_id
        AND p.coach_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can insert versions for their programs"
  ON public.master_program_versions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.programs p
      WHERE p.id = master_program_versions.program_id
        AND p.coach_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can delete their program versions"
  ON public.master_program_versions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.programs p
      WHERE p.id = master_program_versions.program_id
        AND p.coach_id = auth.uid()
    )
  );
