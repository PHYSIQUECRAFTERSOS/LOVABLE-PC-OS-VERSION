import { supabase } from "@/integrations/supabase/client";

interface WorkoutExerciseRow {
  id: string;
  workout_id: string;
  exercise_id: string;
  exercise_order: number | null;
  sets: number;
  reps: string | null;
  rest_seconds: number | null;
  tempo: string | null;
  rir: number | null;
  rpe_target: number | null;
  notes: string | null;
  video_override: string | null;
  progression_type: string | null;
  weight_increment: number | null;
  increment_type: string | null;
  rpe_threshold: number | null;
  progression_mode: string | null;
  grouping_type: string | null;
  grouping_id: string | null;
}

interface ExerciseRow {
  id: string;
  name: string;
  primary_muscle: string | null;
  youtube_url: string | null;
  video_url: string | null;
  youtube_thumbnail: string | null;
  equipment: string | null;
}

export interface WorkoutExerciseDetail extends WorkoutExerciseRow {
  exercise: ExerciseRow | null;
}

export interface WorkoutThumbnailSummary {
  thumbnail: string | null;
  count: number;
}

export interface WorkoutExercisePlanInput {
  exercise_id: string;
  exercise_order: number;
  sets: number;
  reps: string | null;
  tempo: string | null;
  rest_seconds: number | null;
  rir: number | null;
  rpe_target: number | null;
  notes: string | null;
  superset_group?: string | null;
  grouping_type: string | null;
  grouping_id: string | null;
}

export async function replaceWorkoutExercisePlan({
  workoutId,
  name,
  instructions,
  isAccessory = null,
  exercises,
}: {
  workoutId: string;
  name: string;
  instructions: string | null;
  isAccessory?: boolean | null;
  exercises: WorkoutExercisePlanInput[];
}): Promise<void> {
  const { error } = await (supabase as any).rpc("replace_workout_exercise_plan", {
    _workout_id: workoutId,
    _name: name,
    _instructions: instructions,
    _is_accessory: isAccessory,
    _exercises: exercises,
  });

  if (error) throw error;
}

export async function fetchWorkoutExerciseDetails(
  workoutId: string,
  signal?: AbortSignal,
): Promise<WorkoutExerciseDetail[]> {
  const rpcQuery = (supabase as any).rpc("get_workout_exercise_details", {
    _workout_id: workoutId,
  });

  const { data: rpcRows, error: rpcError } = await (signal
    ? rpcQuery.abortSignal(signal)
    : rpcQuery);

  if (!rpcError) {
    return ((rpcRows ?? []) as Array<
      WorkoutExerciseRow & {
        exercise_name: string | null;
        primary_muscle: string | null;
        youtube_url: string | null;
        video_url: string | null;
        youtube_thumbnail: string | null;
        equipment: string | null;
      }
    >).map(({ exercise_name, primary_muscle, youtube_url, video_url, youtube_thumbnail, equipment, ...row }) => ({
      ...row,
      exercise: row.exercise_id
        ? {
            id: row.exercise_id,
            name: exercise_name || "Exercise",
            primary_muscle,
            youtube_url,
            video_url,
            youtube_thumbnail,
            equipment,
          }
        : null,
    }));
  }

  if (rpcError?.code !== "42883" && rpcError?.code !== "PGRST202") {
    throw rpcError;
  }

  let workoutExercisesQuery = supabase
    .from("workout_exercises")
    .select(
      "id, workout_id, exercise_id, exercise_order, sets, reps, rest_seconds, tempo, rir, rpe_target, notes, video_override, progression_type, weight_increment, increment_type, rpe_threshold, progression_mode, grouping_type, grouping_id",
    )
    .eq("workout_id", workoutId)
    .order("exercise_order", { ascending: true });

  if (signal) {
    workoutExercisesQuery = workoutExercisesQuery.abortSignal(signal);
  }

  const { data: workoutExerciseRows, error: workoutExercisesError } = await workoutExercisesQuery;

  if (workoutExercisesError) {
    throw workoutExercisesError;
  }

  const rows = (workoutExerciseRows ?? []) as WorkoutExerciseRow[];

  if (rows.length === 0) {
    return [];
  }

  const exerciseIds = [...new Set(rows.map((row) => row.exercise_id).filter(Boolean))];
  const exerciseMap = new Map<string, ExerciseRow>();

  if (exerciseIds.length > 0) {
    let exercisesQuery = supabase
      .from("exercises")
      .select("id, name, primary_muscle, youtube_url, video_url, youtube_thumbnail, equipment")
      .in("id", exerciseIds);

    if (signal) {
      exercisesQuery = exercisesQuery.abortSignal(signal);
    }

    const { data: exerciseRows, error: exercisesError } = await exercisesQuery;

    if (exercisesError) {
      throw exercisesError;
    }

    ((exerciseRows ?? []) as ExerciseRow[]).forEach((exercise) => {
      exerciseMap.set(exercise.id, exercise);
    });
  }

  return rows.map((row) => ({
    ...row,
    exercise: exerciseMap.get(row.exercise_id) ?? null,
  }));
}

export async function fetchWorkoutThumbnailSummary(
  workoutIds: string[],
  signal?: AbortSignal,
): Promise<Map<string, WorkoutThumbnailSummary>> {
  if (workoutIds.length === 0) {
    return new Map<string, WorkoutThumbnailSummary>();
  }

  let workoutExercisesQuery = supabase
    .from("workout_exercises")
    .select("workout_id, exercise_id, exercise_order")
    .in("workout_id", workoutIds)
    .order("workout_id", { ascending: true })
    .order("exercise_order", { ascending: true });

  if (signal) {
    workoutExercisesQuery = workoutExercisesQuery.abortSignal(signal);
  }

  const { data: workoutExerciseRows, error: workoutExercisesError } = await workoutExercisesQuery;

  if (workoutExercisesError) {
    throw workoutExercisesError;
  }

  const rows = (workoutExerciseRows ?? []) as Array<{
    workout_id: string;
    exercise_id: string;
    exercise_order: number | null;
  }>;

  const firstExerciseIds = [
    ...new Set(
      rows
        .filter((row, index, collection) => {
          const firstIndex = collection.findIndex(
            (candidate) => candidate.workout_id === row.workout_id,
          );
          return firstIndex === index;
        })
        .map((row) => row.exercise_id)
        .filter(Boolean),
    ),
  ];

  if (firstExerciseIds.length === 0) {
    const summaryMap = new Map<string, WorkoutThumbnailSummary>();
    rows.forEach((row) => {
      const current = summaryMap.get(row.workout_id);
      summaryMap.set(row.workout_id, {
        thumbnail: current?.thumbnail ?? null,
        count: (current?.count ?? 0) + 1,
      });
    });
    return summaryMap;
  }

  let exercisesQuery = supabase
    .from("exercises")
    .select("id, youtube_thumbnail")
    .in("id", firstExerciseIds);

  if (signal) {
    exercisesQuery = exercisesQuery.abortSignal(signal);
  }

  const { data: exerciseRows, error: exercisesError } = await exercisesQuery;

  if (exercisesError) {
    throw exercisesError;
  }

  const thumbnailMap = new Map(
    ((exerciseRows ?? []) as Array<{ id: string; youtube_thumbnail: string | null }>).map((exercise) => [
      exercise.id,
      exercise.youtube_thumbnail,
    ]),
  );

  const summaryMap = new Map<string, WorkoutThumbnailSummary>();

  rows.forEach((row) => {
    const current = summaryMap.get(row.workout_id);
    if (!current) {
      summaryMap.set(row.workout_id, {
        thumbnail: thumbnailMap.get(row.exercise_id) ?? null,
        count: 1,
      });
      return;
    }

    summaryMap.set(row.workout_id, {
      ...current,
      count: current.count + 1,
    });
  });

  return summaryMap;
}