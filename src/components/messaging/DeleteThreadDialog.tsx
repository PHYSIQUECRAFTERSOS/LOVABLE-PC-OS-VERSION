import { useState, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  threadId: string;
  clientName: string;
  onDeleted: () => void;
}

const DeleteThreadDialog = ({ open, onOpenChange, threadId, clientName, onDeleted }: Props) => {
  const { user } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  const firstName = (clientName || "").trim().split(" ")[0] || clientName;
  const canConfirm = typed.trim().toLowerCase() === firstName.toLowerCase();

  useEffect(() => {
    if (!open) {
      setStep(1);
      setTyped("");
      setBusy(false);
    }
  }, [open]);

  const handleDelete = async () => {
    if (!user || !canConfirm) return;
    setBusy(true);
    const { error } = await supabase
      .from("message_threads")
      .update({ coach_hidden_at: new Date().toISOString() } as any)
      .eq("id", threadId)
      .eq("coach_id", user.id);
    setBusy(false);
    if (error) {
      toast.error("Could not delete", { description: error.message });
      return;
    }
    toast.success("Conversation removed from your inbox", {
      description: "Prior messages are saved and will reappear if you message this client again.",
    });
    onOpenChange(false);
    onDeleted();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        {step === 1 ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the conversation with <span className="font-semibold text-foreground">{clientName}</span> from your inbox.
                Prior messages are preserved — starting a new conversation with them later will restore the full history.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={(e) => { e.preventDefault(); setStep(2); }}>
                Continue
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Confirm deletion
              </AlertDialogTitle>
              <AlertDialogDescription>
                Type <span className="font-mono font-semibold text-foreground">{firstName}</span> to confirm removing this conversation from your inbox.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
              <Label htmlFor="confirm-name" className="text-xs">Client first name</Label>
              <Input
                id="confirm-name"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={firstName}
                autoFocus
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); handleDelete(); }}
                disabled={!canConfirm || busy}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete permanently"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteThreadDialog;
