import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface CoachEventNoteProps {
  eventId: string;
  coachId: string;
}

const CoachEventNote = ({ eventId, coachId }: CoachEventNoteProps) => {
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [existingId, setExistingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("calendar_event_notes")
        .select("id, note_text")
        .eq("event_id", eventId)
        .eq("coach_id", coachId)
        .maybeSingle();
      if (data) {
        setNote(data.note_text);
        setExistingId(data.id);
      }
      setLoaded(true);
    };
    fetch();
  }, [eventId, coachId]);

  const handleSave = async () => {
    setSaving(true);
    if (existingId) {
      const { error } = await supabase
        .from("calendar_event_notes")
        .update({ note_text: note, updated_at: new Date().toISOString() })
        .eq("id", existingId);
      if (error) {
        toast({ title: "Error saving note", variant: "destructive" });
      } else {
        toast({ title: "Note updated ✓" });
      }
    } else {
      const { data, error } = await supabase
        .from("calendar_event_notes")
        .insert({ event_id: eventId, coach_id: coachId, note_text: note })
        .select()
        .single();
      if (error) {
        toast({ title: "Error saving note", variant: "destructive" });
      } else {
        setExistingId(data.id);
        toast({ title: "Note saved ✓" });
      }
    }
    setSaving(false);
  };

  if (!loaded) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs text-[#888888]">Coach Note</p>
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note about this check-in..."
        className="bg-[#1a1a1a] border-[#333333] text-sm resize-none"
        rows={2}
      />
      {note.trim() && (
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving}
          className="w-full"
        >
          {saving ? "Saving..." : existingId ? "Update Note" : "Save Note"}
        </Button>
      )}
    </div>
  );
};

export default CoachEventNote;
