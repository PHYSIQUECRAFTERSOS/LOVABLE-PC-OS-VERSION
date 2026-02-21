
-- Extend exercises table with enhanced fields
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS primary_muscle text,
  ADD COLUMN IF NOT EXISTS secondary_muscle text,
  ADD COLUMN IF NOT EXISTS equipment text,
  ADD COLUMN IF NOT EXISTS movement_pattern text,
  ADD COLUMN IF NOT EXISTS youtube_url text,
  ADD COLUMN IF NOT EXISTS youtube_thumbnail text,
  ADD COLUMN IF NOT EXISTS coaching_cues text,
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- Add instructions field to workouts
ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS instructions text;

-- Add video_override to workout_exercises
ALTER TABLE public.workout_exercises
  ADD COLUMN IF NOT EXISTS video_override text;

-- Allow coaches to update exercises
CREATE POLICY "Coaches can update exercises"
  ON public.exercises
  FOR UPDATE
  USING (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Allow coaches to delete exercises  
CREATE POLICY "Coaches can delete exercises"
  ON public.exercises
  FOR DELETE
  USING (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Create exercise-videos storage bucket for coach-uploaded videos
INSERT INTO storage.buckets (id, name, public) VALUES ('exercise-videos', 'exercise-videos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for exercise videos
CREATE POLICY "Anyone can view exercise videos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'exercise-videos');

CREATE POLICY "Coaches can upload exercise videos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'exercise-videos' AND (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('coach', 'admin'))
  ));

CREATE POLICY "Coaches can delete exercise videos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'exercise-videos' AND (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('coach', 'admin'))
  ));
