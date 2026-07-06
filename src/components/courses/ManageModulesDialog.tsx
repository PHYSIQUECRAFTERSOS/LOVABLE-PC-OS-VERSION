import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CourseModule } from "@/hooks/useCourses";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  modules: CourseModule[];
  onChanged: () => void;
}

const ManageModulesDialog = ({ open, onOpenChange, modules, onChanged }: Props) => {
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    const nextOrder = modules.length ? Math.max(...modules.map((m) => m.sort_order)) + 1 : 0;
    const { error } = await supabase
      .from("course_modules")
      .insert({ name: newName.trim(), sort_order: nextOrder });
    setBusy(false);
    if (error) return toast.error("Could not add", { description: error.message });
    setNewName("");
    onChanged();
  };

  const remove = async (id: string) => {
    setBusy(true);
    const { error } = await supabase.from("course_modules").delete().eq("id", id);
    setBusy(false);
    if (error) return toast.error("Could not delete", { description: error.message });
    onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage modules</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New module name"
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
            <Button onClick={add} disabled={busy || !newName.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>
          <div className="space-y-1.5">
            {modules.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm"
              >
                <span>{m.name}</span>
                <button
                  onClick={() => remove(m.id)}
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Delete ${m.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {modules.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">No modules yet.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ManageModulesDialog;
