import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { StickyNote, Plus, Pin, Trash2, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface Note {
  id: string;
  content: string;
  is_pinned: boolean;
  created_at: string;
}

const ClientWorkspaceNotes = ({ clientId }: { clientId: string }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);

  const loadNotes = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("client_notes")
      .select("id, content, is_pinned, created_at")
      .eq("client_id", clientId)
      .eq("coach_id", user.id)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false });
    setNotes((data as Note[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    loadNotes();
  }, [clientId, user]);

  const addNote = async () => {
    if (!user || !newNote.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("client_notes").insert({
      client_id: clientId,
      coach_id: user.id,
      content: newNote.trim(),
    });
    if (error) {
      toast({ title: "Error saving note", variant: "destructive" });
    } else {
      toast({ title: "Note added" });
      setNewNote("");
      loadNotes();
    }
    setSaving(false);
  };

  const togglePin = async (noteId: string, currentPinned: boolean) => {
    await supabase.from("client_notes").update({ is_pinned: !currentPinned }).eq("id", noteId);
    loadNotes();
  };

  const deleteNote = async (noteId: string) => {
    await supabase.from("client_notes").delete().eq("id", noteId);
    toast({ title: "Note deleted" });
    loadNotes();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add Note */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-3">
          <Textarea
            placeholder="Add a note about this client..."
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            rows={3}
            className="resize-none"
          />
          <Button size="sm" onClick={addNote} disabled={saving || !newNote.trim()}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
            Add Note
          </Button>
        </CardContent>
      </Card>

      {/* Notes List */}
      {notes.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <StickyNote className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No notes yet.</p>
          </CardContent>
        </Card>
      ) : (
        notes.map((note) => (
          <Card key={note.id} className={note.is_pinned ? "border-primary/30 bg-primary/5" : ""}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground whitespace-pre-wrap">{note.content}</p>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    {format(new Date(note.created_at), "MMM d, yyyy · h:mm a")}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => togglePin(note.id, note.is_pinned)}
                  >
                    <Pin className={`h-3.5 w-3.5 ${note.is_pinned ? "text-primary" : ""}`} />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={() => deleteNote(note.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
};

export default ClientWorkspaceNotes;
