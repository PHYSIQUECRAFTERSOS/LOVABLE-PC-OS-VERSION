
-- ============================================================
-- Fix: Add admin access path to client_program_assignments SELECT
-- Root cause: When Admin (Kevin) views a client assigned by Coach (Aaron),
-- the SELECT policy only checks coach_id = auth.uid() OR client_id = auth.uid().
-- Admin is neither, so the assignment is invisible, breaking the entire chain.
-- ============================================================

-- Also add coach-of-client path: any coach who owns the client via coach_clients
-- should see their assignments even if another coach created the assignment.

DROP POLICY IF EXISTS "Coach and client can view assignments" ON public.client_program_assignments;
CREATE POLICY "Coach and client can view assignments" ON public.client_program_assignments
  FOR SELECT USING (
    auth.uid() = coach_id
    OR auth.uid() = client_id
    OR has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.coach_clients cc
      WHERE cc.client_id = client_program_assignments.client_id
        AND cc.coach_id = auth.uid()
        AND cc.status = 'active'
    )
  );

-- Fix: Add admin access path to client_program_assignments UPDATE/DELETE
DROP POLICY IF EXISTS "Coach can update assignments" ON public.client_program_assignments;
CREATE POLICY "Coach can update assignments" ON public.client_program_assignments
  FOR UPDATE USING (
    auth.uid() = coach_id
    OR has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Coach can delete assignments" ON public.client_program_assignments;
CREATE POLICY "Coach can delete assignments" ON public.client_program_assignments
  FOR DELETE USING (
    auth.uid() = coach_id
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Fix: Add admin path to program_phases ALL policy
-- Currently only checks programs.coach_id = auth.uid() OR programs.client_id = auth.uid()
DROP POLICY IF EXISTS "Coaches manage their program phases" ON public.program_phases;
CREATE POLICY "Coaches manage their program phases" ON public.program_phases
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM programs p
      WHERE p.id = program_phases.program_id
        AND (p.coach_id = auth.uid() OR p.client_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM programs p
      WHERE p.id = program_phases.program_id
        AND (p.coach_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
    )
  );
