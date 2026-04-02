
CREATE POLICY "Coaches can view shared master programs"
ON public.programs
FOR SELECT
TO authenticated
USING (
  is_master = true 
  AND is_template = true 
  AND (public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin'))
);
