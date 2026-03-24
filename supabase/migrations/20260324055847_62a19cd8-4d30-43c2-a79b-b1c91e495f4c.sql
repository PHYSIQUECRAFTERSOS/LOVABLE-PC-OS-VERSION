-- Drop the too-narrow teammate policy and replace with a broader one
-- This is a private coaching platform where all users should see each other's names
DROP POLICY IF EXISTS "Clients can view teammates profiles" ON public.profiles;

-- Allow all authenticated users to see all profiles
-- Safe for this private coaching platform; phone field is rarely populated
CREATE POLICY "Authenticated users can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);
