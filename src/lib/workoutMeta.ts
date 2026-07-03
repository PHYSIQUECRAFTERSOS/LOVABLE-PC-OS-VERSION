/**
 * Shared workout-metadata utilities for the coach training UI.
 *
 * Single source of truth for:
 *  - YouTube thumbnail derivation
 *  - Estimated workout duration
 *  - Batch-fetching exercise/duration/thumbnail metadata for a list of workouts
 *
 * Used by both Master Libraries' ProgramDetailView and the client-profile
 * Training tab (ClientProgramTwoPane).
 */
import { fetchWorkoutExerciseDetails } from "@/lib/workoutExerciseQueries";

export interface WorkoutMeta {
  exerciseCount: number;
  estimatedMinutes: number;
  thumbnailUrl: string | null;
}

/**
 * Convert a YouTube watch/short URL to a thumbnail URL.
 * Returns null if the URL is empty, malformed, or not a recognizable YouTube URL.
 */
export function getYouTubeThumbnail(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^?&/]+)/);
  return match ? `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg` : null;
}

/**
 * Estimate a workout's duration in minutes from its exercises' set + rest data.
 * Uses 35s avg per set (hypertrophy default) + rest_seconds * (sets - 1)
 * + 50s exercise transition buffer.
 */
export function estimateWorkoutMinutes(
  exercises: { sets: number | null | undefined; rest_seconds: number | null | undefined }[]
): number {
  if (exercises.length === 0) return 0;
  const AVG_SET_DURATION = 35;
  let totalSeconds = 0;
  for (const ex of exercises) {
    const sets = ex.sets || 3;
    const rest = ex.rest_seconds || 60;
    totalSeconds += sets * AVG_SET_DURATION + Math.max(0, sets - 1) * rest;
  }
  totalSeconds += Math.max(0, exercises.length - 1) * 50;
  return Math.round(totalSeconds / 60);
}

/**
 * Batch-fetch exercise count, estimated duration, and first-exercise thumbnail
 * for a set of workout IDs. Returns a record keyed by workout_id.
 *
 * Empty input → empty record (no DB call).
 */
export async function fetchWorkoutMeta(workoutIds: string[]): Promise<Record<string, WorkoutMeta>> {
  if (workoutIds.length === 0) return {};

  const settled = await Promise.allSettled(
    workoutIds.map((workoutId) => fetchWorkoutExerciseDetails(workoutId)),
  );

  const meta: Record<string, WorkoutMeta> = {};
  workoutIds.forEach((wId, index) => {
    const result = settled[index];
    const exes = result.status === "fulfilled" ? result.value : [];
    const firstEx = exes[0];
    const thumb = firstEx
      ? (firstEx.exercise?.youtube_thumbnail || getYouTubeThumbnail(firstEx.exercise?.youtube_url))
      : null;
    meta[wId] = {
      exerciseCount: exes.length,
      estimatedMinutes: estimateWorkoutMinutes(
        exes.map((e) => ({ sets: e.sets, rest_seconds: e.rest_seconds }))
      ),
      thumbnailUrl: thumb,
    };
  });

  return meta;
}
