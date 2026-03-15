-- Allow coaches/admins to enroll participants on behalf of clients
CREATE POLICY "Coaches can enroll participants"
  ON public.challenge_participants FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() OR public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin')
  );

-- Drop the old restrictive INSERT policy
DROP POLICY IF EXISTS "Join challenge" ON public.challenge_participants;

-- Allow coaches to manage badges
DROP POLICY IF EXISTS "Admin can manage badges" ON public.badges;
CREATE POLICY "Coaches and admins can manage badges" ON public.badges FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin'));