
-- 1. Fix the recursive RLS on conversation_participants using a security definer function
CREATE OR REPLACE FUNCTION public.is_conversation_participant(_conversation_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = _conversation_id
    AND user_id = _user_id
  )
$$;

-- 2. Drop the recursive policy on conversation_participants
DROP POLICY IF EXISTS "Participants can view members" ON public.conversation_participants;

-- 3. Create a non-recursive replacement using the security definer function
CREATE POLICY "Participants can view members"
ON public.conversation_participants
FOR SELECT
USING (
  public.is_conversation_participant(conversation_id, auth.uid())
);

-- 4. Also fix the conversations SELECT policy that references conversation_participants
DROP POLICY IF EXISTS "Participants can view conversations" ON public.conversations;
CREATE POLICY "Participants can view conversations"
ON public.conversations
FOR SELECT
USING (
  public.is_conversation_participant(id, auth.uid())
);

-- 5. Fix messages policies similarly
DROP POLICY IF EXISTS "Participants can view messages" ON public.messages;
CREATE POLICY "Participants can view messages"
ON public.messages
FOR SELECT
USING (
  public.is_conversation_participant(conversation_id, auth.uid())
);

DROP POLICY IF EXISTS "Participants can send messages" ON public.messages;
CREATE POLICY "Participants can send messages"
ON public.messages
FOR INSERT
WITH CHECK (
  sender_id = auth.uid()
  AND public.is_conversation_participant(conversation_id, auth.uid())
);

-- 6. Fix message_reads policy
DROP POLICY IF EXISTS "Participants can view read receipts" ON public.message_reads;
CREATE POLICY "Participants can view read receipts"
ON public.message_reads
FOR SELECT
USING (
  user_id = auth.uid()
);

-- 7. Add admin access to message_threads
DROP POLICY IF EXISTS "Admins can view all threads" ON public.message_threads;
CREATE POLICY "Admins can view all threads"
ON public.message_threads
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));
