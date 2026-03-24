-- Clean up redundant narrow SELECT policies now that we have a broad authenticated one
DROP POLICY IF EXISTS "Clients can read assigned coach profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Coaches and admins can view all profiles" ON public.profiles;
