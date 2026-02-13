
-- Add sugar and sodium columns to food_items
ALTER TABLE public.food_items
ADD COLUMN IF NOT EXISTS sugar numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS sodium numeric DEFAULT 0;

-- Add sugar and sodium columns to nutrition_logs
ALTER TABLE public.nutrition_logs
ADD COLUMN IF NOT EXISTS sugar numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS sodium numeric DEFAULT 0;

-- Create saved_meals table
CREATE TABLE IF NOT EXISTS public.saved_meals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  name TEXT NOT NULL,
  meal_type TEXT NOT NULL DEFAULT 'snack',
  calories NUMERIC NOT NULL DEFAULT 0,
  protein NUMERIC NOT NULL DEFAULT 0,
  carbs NUMERIC NOT NULL DEFAULT 0,
  fat NUMERIC NOT NULL DEFAULT 0,
  fiber NUMERIC DEFAULT 0,
  sugar NUMERIC DEFAULT 0,
  sodium NUMERIC DEFAULT 0,
  servings NUMERIC NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on saved_meals
ALTER TABLE public.saved_meals ENABLE ROW LEVEL SECURITY;

-- RLS policies for saved_meals
CREATE POLICY "Clients can manage own saved meals" 
ON public.saved_meals 
FOR ALL 
USING (client_id = auth.uid());

CREATE POLICY "Coaches can view client saved meals" 
ON public.saved_meals 
FOR SELECT 
USING (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_saved_meals_updated_at
BEFORE UPDATE ON public.saved_meals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
