
-- Onboarding profiles table for multi-step data collection
CREATE TABLE public.onboarding_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  
  -- Step 1: Goal
  primary_goal TEXT,
  
  -- Step 2: Body Metrics
  age INTEGER,
  height_cm NUMERIC,
  current_weight_kg NUMERIC,
  estimated_body_fat_pct NUMERIC,
  activity_level TEXT,
  
  -- Step 3: Nutrition History
  tracked_macros_before BOOLEAN,
  food_intolerances TEXT[] DEFAULT '{}',
  digestive_issues TEXT[] DEFAULT '{}',
  
  -- Step 4: Training Background
  injuries TEXT,
  surgeries TEXT,
  
  -- Step 5: Health Sync
  health_sync_status TEXT NOT NULL DEFAULT 'pending',
  
  -- Meta
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  current_step INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.onboarding_profiles ENABLE ROW LEVEL SECURITY;

-- Users can manage their own onboarding profile
CREATE POLICY "Users can view own onboarding"
ON public.onboarding_profiles FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own onboarding"
ON public.onboarding_profiles FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own onboarding"
ON public.onboarding_profiles FOR UPDATE
USING (user_id = auth.uid());

-- Coaches can view client onboarding data
CREATE POLICY "Coaches can view onboarding data"
ON public.onboarding_profiles FOR SELECT
USING (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Timestamp trigger
CREATE TRIGGER update_onboarding_profiles_updated_at
BEFORE UPDATE ON public.onboarding_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
