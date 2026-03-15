
-- 1. Add attachment columns to thread_messages
ALTER TABLE thread_messages
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS attachment_type text,
  ADD COLUMN IF NOT EXISTS attachment_name text;

-- 2. Create message_reactions table
CREATE TABLE IF NOT EXISTS message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES thread_messages(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

-- RLS: Any authenticated user who is a participant in the thread can read reactions
CREATE POLICY "Thread participants can read reactions"
  ON message_reactions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM thread_messages tm
      JOIN message_threads mt ON mt.id = tm.thread_id
      WHERE tm.id = message_reactions.message_id
        AND (mt.coach_id = auth.uid() OR mt.client_id = auth.uid())
    )
  );

-- RLS: Authenticated users can insert their own reactions
CREATE POLICY "Users can insert own reactions"
  ON message_reactions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM thread_messages tm
      JOIN message_threads mt ON mt.id = tm.thread_id
      WHERE tm.id = message_reactions.message_id
        AND (mt.coach_id = auth.uid() OR mt.client_id = auth.uid())
    )
  );

-- RLS: Users can delete their own reactions
CREATE POLICY "Users can delete own reactions"
  ON message_reactions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 3. Create chat-attachments storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: thread participants can upload
CREATE POLICY "Thread participants can upload chat attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments');

-- Storage RLS: thread participants can read
CREATE POLICY "Thread participants can read chat attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chat-attachments');

-- 4. Enable realtime on message_reactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
