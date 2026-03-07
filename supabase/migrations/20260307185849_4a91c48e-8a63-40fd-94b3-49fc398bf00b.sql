
ALTER TABLE program_workouts 
ADD COLUMN IF NOT EXISTS exclude_from_numbering boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS custom_tag text DEFAULT null;
