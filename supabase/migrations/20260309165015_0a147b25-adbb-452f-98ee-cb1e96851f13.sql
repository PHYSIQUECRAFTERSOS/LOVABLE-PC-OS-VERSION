-- Add missing FK constraints to program_workouts for data integrity
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'program_workouts_workout_id_fkey') THEN
    ALTER TABLE program_workouts
      ADD CONSTRAINT program_workouts_workout_id_fkey
      FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'program_workouts_week_id_fkey') THEN
    ALTER TABLE program_workouts
      ADD CONSTRAINT program_workouts_week_id_fkey
      FOREIGN KEY (week_id) REFERENCES program_weeks(id) ON DELETE CASCADE;
  END IF;
END $$;