import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface CourseModule {
  id: string;
  name: string;
  sort_order: number;
}

export interface Course {
  id: string;
  title: string;
  youtube_url: string;
  youtube_video_id: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  description: string | null;
  module_id: string | null;
  tags: string[];
  is_pinned: boolean;
  posted_at: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useCourses() {
  const { user } = useAuth();
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      supabase.from("course_modules").select("*").order("sort_order", { ascending: true }),
      supabase.from("courses").select("*").order("is_pinned", { ascending: false }).order("posted_at", { ascending: false }),
      user
        ? supabase.from("course_watches").select("course_id").eq("user_id", user.id)
        : Promise.resolve({ data: [], error: null } as any),
    ]);
    if (results[0].status === "fulfilled" && !results[0].value.error) {
      setModules((results[0].value.data as CourseModule[]) || []);
    }
    if (results[1].status === "fulfilled" && !results[1].value.error) {
      setCourses((results[1].value.data as Course[]) || []);
    }
    if (results[2].status === "fulfilled" && !(results[2].value as any).error) {
      const rows = ((results[2].value as any).data || []) as { course_id: string }[];
      setWatched(new Set(rows.map((r) => r.course_id)));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const markWatched = useCallback(
    async (courseId: string) => {
      if (!user || watched.has(courseId)) return;
      setWatched((prev) => new Set(prev).add(courseId));
      await supabase
        .from("course_watches")
        .upsert({ course_id: courseId, user_id: user.id, watched_at: new Date().toISOString() }, { onConflict: "course_id,user_id" });
    },
    [user, watched]
  );

  return { modules, courses, watched, loading, reload: load, markWatched };
}
