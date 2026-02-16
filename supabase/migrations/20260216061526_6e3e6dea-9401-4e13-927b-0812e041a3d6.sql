
-- Community Posts
CREATE TABLE public.community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL,
  content text NOT NULL DEFAULT '',
  post_type text NOT NULL DEFAULT 'feed', -- 'feed' or 'announcement'
  media_url text,
  media_type text, -- 'image', 'video', 'voice'
  is_pinned boolean NOT NULL DEFAULT false,
  is_spotlight boolean NOT NULL DEFAULT false,
  comments_locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view posts"
  ON public.community_posts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create feed posts"
  ON public.community_posts FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid() AND (
      post_type = 'feed' OR
      has_role(auth.uid(), 'coach'::app_role) OR
      has_role(auth.uid(), 'admin'::app_role)
    )
  );

CREATE POLICY "Users can update own posts"
  ON public.community_posts FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid() OR has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can delete own posts or coaches moderate"
  ON public.community_posts FOR DELETE
  TO authenticated
  USING (author_id = auth.uid() OR has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Community Comments
CREATE TABLE public.community_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view comments"
  ON public.community_comments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create comments"
  ON public.community_comments FOR INSERT
  TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Users can delete own comments or coaches moderate"
  ON public.community_comments FOR DELETE
  TO authenticated
  USING (author_id = auth.uid() OR has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Community Likes (unique per user per post)
CREATE TABLE public.community_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);

ALTER TABLE public.community_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view likes"
  ON public.community_likes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can like posts"
  ON public.community_likes FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can unlike posts"
  ON public.community_likes FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Saved Posts
CREATE TABLE public.community_saved_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);

ALTER TABLE public.community_saved_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own saved posts"
  ON public.community_saved_posts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can save posts"
  ON public.community_saved_posts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can unsave posts"
  ON public.community_saved_posts FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Reports
CREATE TABLE public.community_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL,
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending', -- pending, reviewed, dismissed
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can report posts"
  ON public.community_reports FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "Coaches can view reports"
  ON public.community_reports FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Coaches can update reports"
  ON public.community_reports FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- User Engagement Stats
CREATE TABLE public.community_user_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  total_posts integer NOT NULL DEFAULT 0,
  total_comments integer NOT NULL DEFAULT 0,
  total_likes_received integer NOT NULL DEFAULT 0,
  engagement_score integer NOT NULL DEFAULT 0,
  current_streak integer NOT NULL DEFAULT 0,
  longest_streak integer NOT NULL DEFAULT 0,
  last_post_date date,
  badges jsonb NOT NULL DEFAULT '[]'::jsonb,
  posting_restricted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.community_user_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view stats"
  ON public.community_user_stats FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can upsert stats"
  ON public.community_user_stats FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own stats"
  ON public.community_user_stats FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime for posts and comments
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_likes;

-- Storage bucket for community media
INSERT INTO storage.buckets (id, name, public) VALUES ('community-media', 'community-media', true);

CREATE POLICY "Anyone can view community media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'community-media');

CREATE POLICY "Authenticated users can upload community media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'community-media');

CREATE POLICY "Users can delete own community media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'community-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Function to update engagement score
CREATE OR REPLACE FUNCTION public.recalc_engagement_score(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _posts int;
  _comments int;
  _likes int;
  _score int;
  _streak int;
  _longest int;
  _last_date date;
BEGIN
  SELECT count(*) INTO _posts FROM community_posts WHERE author_id = _user_id;
  SELECT count(*) INTO _comments FROM community_comments WHERE author_id = _user_id;
  SELECT count(*) INTO _likes FROM community_likes cl JOIN community_posts cp ON cp.id = cl.post_id WHERE cp.author_id = _user_id;
  
  _score := (_posts * 10) + (_comments * 3) + (_likes * 2);
  
  -- Get current streak info
  SELECT current_streak, longest_streak, last_post_date INTO _streak, _longest, _last_date
  FROM community_user_stats WHERE user_id = _user_id;
  
  IF _last_date IS NULL OR _last_date < CURRENT_DATE - 1 THEN
    _streak := 1;
  ELSIF _last_date = CURRENT_DATE - 1 THEN
    _streak := COALESCE(_streak, 0) + 1;
  END IF;
  
  IF _streak > COALESCE(_longest, 0) THEN
    _longest := _streak;
  END IF;

  INSERT INTO community_user_stats (user_id, total_posts, total_comments, total_likes_received, engagement_score, current_streak, longest_streak, last_post_date)
  VALUES (_user_id, _posts, _comments, _likes, _score, _streak, _longest, CURRENT_DATE)
  ON CONFLICT (user_id) DO UPDATE SET
    total_posts = _posts,
    total_comments = _comments,
    total_likes_received = _likes,
    engagement_score = _score,
    current_streak = _streak,
    longest_streak = _longest,
    last_post_date = CURRENT_DATE,
    updated_at = now();
END;
$$;

-- Trigger to update updated_at on community_posts
CREATE TRIGGER update_community_posts_updated_at
  BEFORE UPDATE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
