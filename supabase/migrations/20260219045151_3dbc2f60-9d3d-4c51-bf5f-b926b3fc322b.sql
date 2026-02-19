
-- Create message_threads table for 1:1 coach-client threads
CREATE TABLE public.message_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  client_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_archived boolean NOT NULL DEFAULT false,
  UNIQUE (coach_id, client_id)
);

-- Enable RLS
ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;

-- Policies: coach and client can view their own threads
CREATE POLICY "Coaches can view own threads"
  ON public.message_threads FOR SELECT
  USING (coach_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view own threads"
  ON public.message_threads FOR SELECT
  USING (client_id = auth.uid());

CREATE POLICY "System can insert threads"
  ON public.message_threads FOR INSERT
  WITH CHECK (coach_id = auth.uid() OR client_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Coaches can update threads"
  ON public.message_threads FOR UPDATE
  USING (coach_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- Create thread_messages table
CREATE TABLE public.thread_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.message_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  read_at timestamp with time zone
);

-- Enable RLS
ALTER TABLE public.thread_messages ENABLE ROW LEVEL SECURITY;

-- Policies: participants can view and insert messages
CREATE POLICY "Thread participants can view messages"
  ON public.thread_messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.message_threads t
    WHERE t.id = thread_messages.thread_id
    AND (t.coach_id = auth.uid() OR t.client_id = auth.uid())
  ));

CREATE POLICY "Thread participants can send messages"
  ON public.thread_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.message_threads t
      WHERE t.id = thread_messages.thread_id
      AND (t.coach_id = auth.uid() OR t.client_id = auth.uid())
    )
  );

CREATE POLICY "Users can update own message read status"
  ON public.thread_messages FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.message_threads t
    WHERE t.id = thread_messages.thread_id
    AND (t.coach_id = auth.uid() OR t.client_id = auth.uid())
  ));

-- Create indexes
CREATE INDEX idx_thread_messages_thread_id ON public.thread_messages(thread_id);
CREATE INDEX idx_thread_messages_created_at ON public.thread_messages(thread_id, created_at);
CREATE INDEX idx_message_threads_coach ON public.message_threads(coach_id);
CREATE INDEX idx_message_threads_client ON public.message_threads(client_id);

-- Trigger to update thread's updated_at on new message
CREATE OR REPLACE FUNCTION public.update_thread_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.message_threads SET updated_at = now() WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_thread_on_message
  AFTER INSERT ON public.thread_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_thread_timestamp();

-- Enable realtime for thread_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.thread_messages;
