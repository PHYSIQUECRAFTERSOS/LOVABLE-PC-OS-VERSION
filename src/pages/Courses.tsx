import { useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useCourses, type Course } from "@/hooks/useCourses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Pin, Settings2, BookOpen, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import CourseCard from "@/components/courses/CourseCard";
import CoursePlayerSheet from "@/components/courses/CoursePlayerSheet";
import NewCourseDialog from "@/components/courses/NewCourseDialog";
import ManageModulesDialog from "@/components/courses/ManageModulesDialog";

const Courses = () => {
  const { role } = useAuth();
  const isCoach = role === "coach" || role === "admin";
  const isAdmin = role === "admin";
  const { modules, courses, watched, loading, reload, markWatched } = useCourses();

  const [search, setSearch] = useState("");
  const [activeModule, setActiveModule] = useState<string>("all");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [playing, setPlaying] = useState<Course | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [showManage, setShowManage] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return courses.filter((c) => {
      if (pinnedOnly && !c.is_pinned) return false;
      if (activeModule !== "all" && c.module_id !== activeModule) return false;
      if (!q) return true;
      const hay = `${c.title} ${c.description || ""} ${(c.tags || []).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [courses, search, activeModule, pinnedOnly]);

  const pinnedStrip = useMemo(
    () => (activeModule === "all" && !search && !pinnedOnly ? courses.filter((c) => c.is_pinned).slice(0, 3) : []),
    [courses, activeModule, search, pinnedOnly]
  );

  const moduleName = (id: string | null) => modules.find((m) => m.id === id)?.name || null;

  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl px-4 pb-24 pt-4 md:pt-6">
        {/* Header */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Courses</h1>
              <p className="text-xs text-muted-foreground">Weekly group calls & training replays</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => setShowManage(true)}>
                <Settings2 className="mr-1.5 h-4 w-4" />
                Modules
              </Button>
            )}
            {isCoach && (
              <Button size="sm" onClick={() => setShowNew(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                New Video
              </Button>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, notes, or tags…"
            className="pl-9"
          />
        </div>

        {/* Filter chips */}
        <div className="mb-5 -mx-4 overflow-x-auto px-4 pb-1">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveModule("all")}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                activeModule === "all" && !pinnedOnly
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              )}
            >
              All
            </button>
            <button
              onClick={() => {
                setPinnedOnly((v) => !v);
                setActiveModule("all");
              }}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1",
                pinnedOnly
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              )}
            >
              <Pin className="h-3 w-3" />
              Pinned
            </button>
            {modules.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setActiveModule(m.id);
                  setPinnedOnly(false);
                }}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  activeModule === m.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>

        {/* Pinned strip */}
        {pinnedStrip.length > 0 && (
          <div className="mb-6">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
              <Pin className="h-3.5 w-3.5" />
              Featured
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              {pinnedStrip.map((c) => (
                <CourseCard
                  key={c.id}
                  course={c}
                  moduleName={moduleName(c.module_id)}
                  watched={watched.has(c.id)}
                  canManage={isCoach}
                  isOwner={c.created_by === undefined ? false : true}
                  onOpen={() => setPlaying(c)}
                  onEdit={() => setEditing(c)}
                  onDeleted={reload}
                />
              ))}
            </div>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card/30 p-10 text-center">
            <BookOpen className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm font-medium">No videos yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isCoach ? "Tap 'New Video' to add your first replay." : "Check back soon for training replays."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {filtered.map((c) => (
              <CourseCard
                key={c.id}
                course={c}
                moduleName={moduleName(c.module_id)}
                watched={watched.has(c.id)}
                canManage={isCoach}
                isOwner={true}
                onOpen={() => setPlaying(c)}
                onEdit={() => setEditing(c)}
                onDeleted={reload}
              />
            ))}
          </div>
        )}

        {playing && (
          <CoursePlayerSheet
            course={playing}
            moduleName={moduleName(playing.module_id)}
            open={!!playing}
            onOpenChange={(v) => !v && setPlaying(null)}
            onWatched={() => markWatched(playing.id)}
          />
        )}
        {showNew && (
          <NewCourseDialog
            open={showNew}
            onOpenChange={setShowNew}
            modules={modules}
            onSaved={reload}
          />
        )}
        {editing && (
          <NewCourseDialog
            open={!!editing}
            onOpenChange={(v) => !v && setEditing(null)}
            modules={modules}
            existing={editing}
            onSaved={reload}
          />
        )}
        {showManage && (
          <ManageModulesDialog
            open={showManage}
            onOpenChange={setShowManage}
            modules={modules}
            onChanged={reload}
          />
        )}
      </div>
    </AppLayout>
  );
};

export default Courses;
