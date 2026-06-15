import { useEffect, useRef, useState } from "react";
import { StickyNote, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface PersonalExerciseNoteProps {
  exerciseId: string;
}

/**
 * Strong-style persistent personal note per (client, exercise).
 * Loads on mount, saves debounced 600ms while typing + on blur/unmount.
 * Optimistic; never blocks the lifting flow.
 */
export default function PersonalExerciseNote({ exerciseId }: PersonalExerciseNoteProps) {
  const { user } = useAuth();
  const [note, setNote] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const loadedRef = useRef(false);
  const lastSavedRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load existing note
  useEffect(() => {
    if (!user || !exerciseId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("client_exercise_notes")
        .select("note")
        .eq("client_id", user.id)
        .eq("exercise_id", exerciseId)
        .maybeSingle();
      if (cancelled) return;
      if (!error && data?.note) {
        setNote(data.note);
        lastSavedRef.current = data.note;
      }
      loadedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [user, exerciseId]);

  const saveNow = async (value: string) => {
    if (!user || !loadedRef.current) return;
    if (value === lastSavedRef.current) return;
    setSaving(true);
    const { error } = await supabase
      .from("client_exercise_notes")
      .upsert(
        { client_id: user.id, exercise_id: exerciseId, note: value },
        { onConflict: "client_id,exercise_id" }
      )
      .select("id")
      .maybeSingle();
    setSaving(false);
    if (!error) {
      lastSavedRef.current = value;
      setSavedFlash(true);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setSavedFlash(false), 1200);
    }
  };

  const handleChange = (value: string) => {
    setNote(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => saveNow(value), 600);
  };

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        // Fire-and-forget final save
        saveNow(note);
      }
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note]);

  const hasNote = note.trim().length > 0;

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={cn(
          "w-full flex items-start gap-2 px-3 py-2 rounded-lg border border-dashed transition-colors text-left",
          hasNote
            ? "border-primary/30 bg-primary/5 hover:bg-primary/10"
            : "border-border/60 hover:border-primary/40 hover:bg-secondary/40"
        )}
      >
        <StickyNote className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", hasNote ? "text-primary" : "text-muted-foreground")} />
        {hasNote ? (
          <span className="text-xs text-foreground line-clamp-2 whitespace-pre-wrap flex-1">{note}</span>
        ) : (
          <span className="text-xs text-muted-foreground flex-1">Add personal note (seat, cable, cues...)</span>
        )}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 p-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
          <StickyNote className="h-3 w-3" />
          My Notes
        </div>
        <div className="flex items-center gap-2">
          {saving && <span className="text-[10px] text-muted-foreground">Saving…</span>}
          {!saving && savedFlash && (
            <span className="text-[10px] text-primary flex items-center gap-0.5">
              <Check className="h-3 w-3" /> Saved
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              if (timerRef.current) clearTimeout(timerRef.current);
              saveNow(note);
              setExpanded(false);
            }}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close notes"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <textarea
        value={note}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={() => {
          if (timerRef.current) clearTimeout(timerRef.current);
          saveNow(note);
        }}
        placeholder="Seat height, cable position, form cues..."
        rows={3}
        className="w-full resize-none rounded-md bg-background/60 border border-border/60 px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50"
        autoFocus
      />
    </div>
  );
}
