import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Users, Megaphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface UserProfile {
  user_id: string;
  full_name: string | null;
}

interface NewConversationDialogProps {
  onCreated: (conversationId: string) => void;
}

const NewConversationDialog = ({ onCreated }: NewConversationDialogProps) => {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [type, setType] = useState<"direct" | "group" | "broadcast">("direct");
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading] = useState(false);
  const isCoach = role === "coach" || role === "admin";

  useEffect(() => {
    if (!open || !user) return;
    const fetchUsers = async () => {
      if (isCoach) {
        // Coaches see their clients
        const { data: assignments } = await supabase
          .from("coach_clients")
          .select("client_id")
          .eq("coach_id", user.id)
          .eq("status", "active");
        const clientIds = (assignments || []).map(a => a.client_id);
        if (clientIds.length > 0) {
          const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", clientIds);
          setUsers((data as UserProfile[]) || []);
        }
      } else {
        // Clients see their coaches
        const { data: assignments } = await supabase
          .from("coach_clients")
          .select("coach_id")
          .eq("client_id", user.id)
          .eq("status", "active");
        const coachIds = (assignments || []).map(a => a.coach_id);
        if (coachIds.length > 0) {
          const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", coachIds);
          setUsers((data as UserProfile[]) || []);
        }
      }
    };
    fetchUsers();
  }, [open, user, isCoach]);

  const toggleUser = (userId: string) => {
    setSelectedUsers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleCreate = async () => {
    if (!user || selectedUsers.length === 0) return;
    setLoading(true);

    const convType = type === "broadcast" ? "broadcast" : selectedUsers.length > 1 ? "group" : "direct";
    const name = convType === "direct" ? null : groupName || (convType === "broadcast" ? "Announcement" : "Group Chat");

    // Check for existing direct conversation
    if (convType === "direct") {
      const { data: existingConvos } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", user.id);

      if (existingConvos) {
        for (const ec of existingConvos) {
          const { data: otherParticipants } = await supabase
            .from("conversation_participants")
            .select("user_id")
            .eq("conversation_id", ec.conversation_id);

          const { data: conv } = await supabase
            .from("conversations")
            .select("type")
            .eq("id", ec.conversation_id)
            .eq("type", "direct")
            .single();

          if (conv && otherParticipants?.length === 2) {
            const otherIds = otherParticipants.map(p => p.user_id);
            if (otherIds.includes(selectedUsers[0])) {
              setLoading(false);
              setOpen(false);
              onCreated(ec.conversation_id);
              return;
            }
          }
        }
      }
    }

    const { data: conv, error } = await supabase
      .from("conversations")
      .insert({ type: convType, name, created_by: user.id })
      .select("id")
      .single();

    if (error || !conv) {
      toast({ title: "Error", description: error?.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    // Add all participants including self
    const participants = [user.id, ...selectedUsers].map(uid => ({
      conversation_id: conv.id,
      user_id: uid,
    }));

    await supabase.from("conversation_participants").insert(participants);

    setLoading(false);
    setOpen(false);
    setSelectedUsers([]);
    setGroupName("");
    onCreated(conv.id);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="outline" className="h-8 w-8">
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Conversation</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {isCoach && (
            <div className="flex gap-2">
              <Button variant={type === "direct" ? "default" : "outline"} size="sm" onClick={() => setType("direct")}>
                Direct
              </Button>
              <Button variant={type === "group" ? "default" : "outline"} size="sm" onClick={() => { setType("group"); }} className="gap-1">
                <Users className="h-3 w-3" /> Group
              </Button>
              <Button variant={type === "broadcast" ? "default" : "outline"} size="sm" onClick={() => { setType("broadcast"); }} className="gap-1">
                <Megaphone className="h-3 w-3" /> Broadcast
              </Button>
            </div>
          )}

          {(type === "group" || type === "broadcast") && (
            <div>
              <Label>{type === "broadcast" ? "Announcement Title" : "Group Name"}</Label>
              <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder={type === "broadcast" ? "e.g. Weekly Update" : "e.g. Team Alpha"} />
            </div>
          )}

          <div>
            <Label>Select {type === "direct" ? "Person" : "People"}</Label>
            <div className="max-h-48 overflow-y-auto space-y-1 mt-2 rounded border border-border p-2">
              {users.length === 0 && (
                <p className="text-sm text-muted-foreground py-2 text-center">No contacts found</p>
              )}
              {users.map(u => (
                <label
                  key={u.user_id}
                  className="flex items-center gap-3 rounded px-3 py-2 hover:bg-secondary cursor-pointer transition-colors"
                >
                  {type === "direct" ? (
                    <input
                      type="radio"
                      name="direct-user"
                      checked={selectedUsers.includes(u.user_id)}
                      onChange={() => setSelectedUsers([u.user_id])}
                      className="accent-primary"
                    />
                  ) : (
                    <Checkbox
                      checked={selectedUsers.includes(u.user_id)}
                      onCheckedChange={() => toggleUser(u.user_id)}
                    />
                  )}
                  <span className="text-sm text-foreground">{u.full_name || "Unnamed"}</span>
                </label>
              ))}
            </div>
          </div>

          <Button onClick={handleCreate} disabled={loading || selectedUsers.length === 0} className="w-full">
            {loading ? "Creating..." : "Start Conversation"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NewConversationDialog;
