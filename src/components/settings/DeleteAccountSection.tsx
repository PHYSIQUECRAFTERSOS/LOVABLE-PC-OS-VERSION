import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout, TIMEOUTS } from "@/lib/performance";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const DeleteAccountSection = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (confirmText !== "DELETE") return;
    if (!user) {
      toast({ title: "Session expired", description: "Please sign in again.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await withTimeout(
        supabase.functions.invoke("request-account-deletion", {
          body: { source: "in_app", reason: reason.trim() },
        }),
        TIMEOUTS.STANDARD_API,
        "in-app-deletion"
      );

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "Account deletion scheduled", description: "Your data will be removed within 30 days." });
      setShowModal(false);

      // Sign out after short delay
      setTimeout(async () => {
        await supabase.auth.signOut();
        window.location.href = "/";
      }, 2000);
    } catch (err: any) {
      console.error("[DeleteAccount] Error:", err);
      toast({
        title: "Deletion failed",
        description: err.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            Delete Account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Permanently delete your account and all associated data. This action cannot be undone.
          </p>
          <Button variant="destructive" onClick={() => setShowModal(true)}>
            Delete My Account
          </Button>
        </CardContent>
      </Card>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete Your Account
            </DialogTitle>
            <DialogDescription className="text-left">
              This action is permanent and irreversible.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 text-sm text-foreground">
              <p className="font-medium mb-2">⚠️ Warning</p>
              <p className="text-muted-foreground">
                Deleting your account permanently removes your profile, workouts, nutrition logs, 
                progress photos, messages, and associated data. This action cannot be undone.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="del-reason-modal">Reason for leaving (optional)</Label>
              <Textarea
                id="del-reason-modal"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Help us improve..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="del-confirm">
                Type <span className="font-mono font-bold text-destructive">DELETE</span> to confirm
              </Label>
              <Input
                id="del-confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type DELETE"
                autoComplete="off"
              />
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => { setShowModal(false); setConfirmText(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={confirmText !== "DELETE" || loading}
              onClick={handleDelete}
            >
              {loading && <Loader2 className="animate-spin" />}
              {loading ? "Deleting..." : "Permanently Delete Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DeleteAccountSection;
