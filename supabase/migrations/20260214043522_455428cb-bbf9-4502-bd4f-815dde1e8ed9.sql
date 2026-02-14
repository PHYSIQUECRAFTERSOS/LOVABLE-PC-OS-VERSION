
-- Storage bucket for meal plan PDFs
INSERT INTO storage.buckets (id, name, public) VALUES ('meal-plans', 'meal-plans', false);

-- Storage policies for meal-plans bucket
CREATE POLICY "Coaches can upload meal plans"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'meal-plans' AND (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

CREATE POLICY "Coaches can update meal plans"
ON storage.objects FOR UPDATE
USING (bucket_id = 'meal-plans' AND (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

CREATE POLICY "Coaches can delete meal plans"
ON storage.objects FOR DELETE
USING (bucket_id = 'meal-plans' AND (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

CREATE POLICY "Clients can view their meal plans"
ON storage.objects FOR SELECT
USING (bucket_id = 'meal-plans' AND (
  has_role(auth.uid(), 'coach'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  auth.uid()::text = (storage.foldername(name))[1]
));

-- Table for meal plan upload metadata
CREATE TABLE public.coach_meal_plan_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  coach_id uuid NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  coach_notes text,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  is_active boolean NOT NULL DEFAULT true,
  client_viewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.coach_meal_plan_uploads ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Coaches can manage meal plan uploads"
ON public.coach_meal_plan_uploads FOR ALL
USING (coach_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view own meal plan uploads"
ON public.coach_meal_plan_uploads FOR SELECT
USING (client_id = auth.uid());

CREATE POLICY "Clients can update viewed_at"
ON public.coach_meal_plan_uploads FOR UPDATE
USING (client_id = auth.uid())
WITH CHECK (client_id = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_coach_meal_plan_uploads_updated_at
BEFORE UPDATE ON public.coach_meal_plan_uploads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
