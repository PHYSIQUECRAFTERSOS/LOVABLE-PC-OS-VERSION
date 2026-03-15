# Add Media Attachments, File Uploads, and Emoji Reactions to Messaging

## What We're Building

1. **Media attachments** — upload photos, videos (max 59s / 200MB), and PDF files in chat both clients and coach can do this ( If it does not accept say " video must be under 1m shorten video and reupload" 
2. **Emoji reactions** — tap any message to react with 👍 💪 🥲 🔥 💯 (like Trainerize)
3. Both coach and client can use all features

## Database Changes

### 1. Add attachment columns to `thread_messages`

```sql
ALTER TABLE thread_messages
  ADD COLUMN attachment_url text,
  ADD COLUMN attachment_type text, -- 'image', 'video', 'pdf'
  ADD COLUMN attachment_name text;
```

### 2. Create `message_reactions` table

```sql
CREATE TABLE message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES thread_messages(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
-- RLS: thread participants can read/insert/delete reactions
```

### 3. Create `chat-attachments` storage bucket (public for signed URLs)

### 4. Enable realtime on `message_reactions`

## UI Changes — `ThreadChatView.tsx`

### Input Bar

- Add a "+" button (or attachment icon) that opens a popover/menu with:
  - "Upload Photo" (accepts image/*)
  - "Upload Video" (accepts video/*, validates ≤59s via `<video>` element duration check, ≤200MB) 
  - "Upload PDF" (accepts application/pdf)
- Files upload to `chat-attachments` bucket, then insert `thread_messages` with `attachment_url`, `attachment_type`, `attachment_name`
- Show upload progress indicator

### Message Rendering

- If `attachment_type === 'image'`: render `<img>` with signed URL, tap to view full-screen
- If `attachment_type === 'video'`: render `<video>` player with controls
- If `attachment_type === 'pdf'`: render a PDF file card with name + download link
- Text content still renders normally (message can have text + attachment)

### Emoji Reactions

- Tap/click a message bubble to show a horizontal emoji picker row (👍 💪 🥲 🔥 💯)
- Selecting an emoji inserts into `message_reactions`; tapping same emoji again removes it (toggle)
- Reactions display as small emoji chips below the message bubble with count
- Realtime subscription on `message_reactions` for live updates

## Also Update `MessagingTab.tsx` (Client Workspace)

- Same attachment and reaction rendering (it shares the same `thread_messages` table)

## Files Changed


| File                                                | Change                                                                                                                           |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Migration**                                       | Add attachment columns to `thread_messages`, create `message_reactions` table, create `chat-attachments` bucket, enable realtime |
| `src/components/messaging/ThreadChatView.tsx`       | Add attachment upload menu, media rendering, emoji reaction UI + logic                                                           |
| `src/components/clients/workspace/MessagingTab.tsx` | Add same media rendering and reaction display                                                                                    |


## Improvements Included

- Video duration validation client-side before upload (rejects >59s) 
- File size validation (200MB for video, 10MB for images, 20MB for PDF)
- Image compression before upload using existing `compressImage` utility
- Signed URLs for private bucket access
- Optimistic reaction toggle for instant UI feedback