
ALTER TABLE thread_messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;

CREATE POLICY "Users can edit own messages"
  ON thread_messages FOR UPDATE
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Users can delete own messages"
  ON thread_messages FOR DELETE
  USING (sender_id = auth.uid());
