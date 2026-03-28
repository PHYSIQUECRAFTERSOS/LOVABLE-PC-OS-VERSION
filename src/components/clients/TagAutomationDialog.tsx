import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Tag, Plus, Search, Zap, Mail, MessageSquare, Trash2, Save, Loader2,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TagAutomation {
  id: string;
  tag_name: string;
  message_content: string;
  email_subject: string | null;
  email_body: string | null;
  send_email: boolean;
  is_active: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  onTagsChanged?: () => void;
}

const TagAutomationDialog = ({ open, onOpenChange, clientId, clientName, onTagsChanged }: Props) => {
  const { user } = useAuth();
  const [tab, setTab] = useState("apply");
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);

  // Apply tags state
  const [allTags, setAllTags] = useState<string[]>([]);
  const [clientTags, setClientTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [newTagName, setNewTagName] = useState("");
  const [tagSearch, setTagSearch] = useState("");

  // Automations state
  const [automations, setAutomations] = useState<TagAutomation[]>([]);
  const [editingAuto, setEditingAuto] = useState<TagAutomation | null>(null);
  const [savingAuto, setSavingAuto] = useState(false);

  const loadData = useCallback(async () => {
    if (!user || !open) return;
    setLoading(true);

    const [tagsRes, clientTagsRes, autosRes] = await Promise.all([
      supabase.from("client_tags").select("tag").eq("coach_id", user.id),
      supabase.from("client_tags").select("tag").eq("client_id", clientId).eq("coach_id", user.id),
      supabase.from("tag_automations").select("*").eq("coach_id", user.id),
    ]);

    const uniqueTags = [...new Set((tagsRes.data || []).map((t: any) => t.tag))];
    const cTags = (clientTagsRes.data || []).map((t: any) => t.tag);

    setAllTags(uniqueTags);
    setClientTags(cTags);
    setSelectedTags(new Set(cTags));
    setAutomations((autosRes.data as TagAutomation[]) || []);
    setLoading(false);
  }, [user, clientId, open]);

  useEffect(() => { loadData(); }, [loadData]);

  const addNewTag = () => {
    const name = newTagName.trim().toUpperCase();
    if (!name) return;
    if (!allTags.includes(name)) setAllTags((prev) => [...prev, name]);
    setSelectedTags((prev) => new Set(prev).add(name));
    setNewTagName("");
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const handleApplyTags = async () => {
    if (!user) return;
    setApplying(true);

    const toAdd = [...selectedTags].filter((t) => !clientTags.includes(t));
    const toRemove = clientTags.filter((t) => !selectedTags.has(t));

    // Remove deselected tags
    if (toRemove.length) {
      await supabase
        .from("client_tags")
        .delete()
        .eq("client_id", clientId)
        .eq("coach_id", user.id)
        .in("tag", toRemove);
    }

    // Add new tags
    if (toAdd.length) {
      await supabase.from("client_tags").insert(
        toAdd.map((tag) => ({ client_id: clientId, coach_id: user.id, tag }))
      );
    }

    // Fire automations for newly added tags
    let messagesSent = 0;
    let emailsQueued = 0;

    for (const tag of toAdd) {
      const auto = automations.find((a) => a.tag_name === tag && a.is_active);
      if (!auto) continue;

      // Replace placeholders
      const msgContent = auto.message_content.replace(/\{\{client_name\}\}/gi, clientName);

      // Send in-app message
      if (msgContent.trim()) {
        try {
          // Get or create thread
          const { data: existingThread } = await supabase
            .from("message_threads")
            .select("id")
            .eq("coach_id", user.id)
            .eq("client_id", clientId)
            .maybeSingle();

          let threadId = existingThread?.id;
          if (!threadId) {
            const { data: newThread } = await supabase
              .from("message_threads")
              .insert({ coach_id: user.id, client_id: clientId })
              .select("id")
              .single();
            threadId = newThread?.id;
          }

          if (threadId) {
            await supabase.from("thread_messages").insert({
              thread_id: threadId,
              sender_id: user.id,
              content: msgContent,
            });
            messagesSent++;
          }
        } catch (e) {
          console.error("Failed to send tag automation message", e);
        }
      }

      // Send email
      if (auto.send_email && auto.email_subject && auto.email_body) {
        try {
          // Get client email
          const { data: clientProfile } = await supabase
            .from("profiles")
            .select("user_id")
            .eq("user_id", clientId)
            .single();

          if (clientProfile) {
            // We need the email from auth - fetch via the client's profile email
            // Since we can't query auth.users, we'll use the client invite email
            const { data: invite } = await supabase
              .from("client_invites")
              .select("email")
              .eq("created_client_id", clientId)
              .maybeSingle();

            const recipientEmail = invite?.email;

            if (recipientEmail) {
              const emailBody = auto.email_body.replace(/\{\{client_name\}\}/gi, clientName);
              const emailSubject = auto.email_subject.replace(/\{\{client_name\}\}/gi, clientName);

              await supabase.functions.invoke("send-transactional-email", {
                body: {
                  templateName: "tag-action-notification",
                  recipientEmail,
                  idempotencyKey: `tag-auto-${clientId}-${tag}-${Date.now()}`,
                  templateData: {
                    clientName,
                    emailSubject,
                    emailBody,
                  },
                },
              });
              emailsQueued++;
            }
          }
        } catch (e) {
          console.error("Failed to queue tag automation email", e);
        }
      }
    }

    // Build toast message
    const parts: string[] = [];
    if (toAdd.length) parts.push(`${toAdd.length} tag${toAdd.length > 1 ? "s" : ""} added`);
    if (toRemove.length) parts.push(`${toRemove.length} removed`);
    if (messagesSent) parts.push(`${messagesSent} message${messagesSent > 1 ? "s" : ""} sent`);
    if (emailsQueued) parts.push(`${emailsQueued} email${emailsQueued > 1 ? "s" : ""} queued`);

    if (parts.length) toast.success(parts.join(" · "));
    else toast.info("No changes made");

    setClientTags([...selectedTags]);
    onTagsChanged?.();
    setApplying(false);
    onOpenChange(false);
  };

  // Automation CRUD
  const saveAutomation = async () => {
    if (!editingAuto || !user) return;
    setSavingAuto(true);

    const payload = {
      coach_id: user.id,
      tag_name: editingAuto.tag_name.trim().toUpperCase(),
      message_content: editingAuto.message_content,
      email_subject: editingAuto.email_subject,
      email_body: editingAuto.email_body,
      send_email: editingAuto.send_email,
      is_active: editingAuto.is_active,
    };

    if (editingAuto.id === "new") {
      const { error } = await supabase.from("tag_automations").insert(payload);
      if (error) {
        toast.error(error.message.includes("unique") ? "Automation for this tag already exists" : error.message);
      } else {
        toast.success("Automation created");
      }
    } else {
      const { error } = await supabase
        .from("tag_automations")
        .update(payload)
        .eq("id", editingAuto.id);
      if (error) toast.error(error.message);
      else toast.success("Automation updated");
    }

    setEditingAuto(null);
    setSavingAuto(false);
    loadData();
  };

  const deleteAutomation = async (id: string) => {
    await supabase.from("tag_automations").delete().eq("id", id);
    toast.success("Automation deleted");
    loadData();
  };

  const filteredTags = allTags.filter((t) =>
    t.toLowerCase().includes(tagSearch.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-primary" />
            Tag Actions
          </DialogTitle>
          <DialogDescription>
            Apply tags to {clientName} and configure automations
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full">
            <TabsTrigger value="apply" className="flex-1 gap-1.5">
              <Tag className="h-3.5 w-3.5" />
              Apply Tags
            </TabsTrigger>
            <TabsTrigger value="automations" className="flex-1 gap-1.5">
              <Zap className="h-3.5 w-3.5" />
              Automations
            </TabsTrigger>
          </TabsList>

          {/* APPLY TAGS TAB */}
          <TabsContent value="apply" className="flex-1 flex flex-col min-h-0 space-y-3">
            {loading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : (
              <>
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search tags..."
                    value={tagSearch}
                    onChange={(e) => setTagSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {/* Add new tag */}
                <div className="flex gap-2">
                  <Input
                    placeholder="New tag name..."
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addNewTag()}
                    className="flex-1"
                  />
                  <Button size="sm" variant="outline" onClick={addNewTag} disabled={!newTagName.trim()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {/* Tag list */}
                <ScrollArea className="flex-1 max-h-[280px]">
                  <div className="space-y-1">
                    {filteredTags.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No tags yet. Create one above!
                      </p>
                    )}
                    {filteredTags.map((tag) => {
                      const hasAutomation = automations.some((a) => a.tag_name === tag && a.is_active);
                      const isNew = !clientTags.includes(tag) && selectedTags.has(tag);
                      return (
                        <label
                          key={tag}
                          className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-secondary/50 cursor-pointer transition-colors"
                        >
                          <Checkbox
                            checked={selectedTags.has(tag)}
                            onCheckedChange={() => toggleTag(tag)}
                          />
                          <span className="text-sm font-medium flex-1">{tag}</span>
                          <div className="flex items-center gap-1">
                            {hasAutomation && (
                              <Badge variant="outline" className="text-[10px] border-primary/30 text-primary gap-0.5">
                                <Zap className="h-2.5 w-2.5" />
                                Auto
                              </Badge>
                            )}
                            {isNew && (
                              <Badge className="text-[10px] bg-green-500/20 text-green-400 border-green-500/30">
                                New
                              </Badge>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </ScrollArea>

                <Button onClick={handleApplyTags} disabled={applying} className="w-full">
                  {applying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Tag className="h-4 w-4 mr-2" />}
                  Apply Tags
                </Button>
              </>
            )}
          </TabsContent>

          {/* AUTOMATIONS TAB */}
          <TabsContent value="automations" className="flex-1 flex flex-col min-h-0 space-y-3">
            {editingAuto ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Tag Name</Label>
                  <Input
                    value={editingAuto.tag_name}
                    onChange={(e) => setEditingAuto({ ...editingAuto, tag_name: e.target.value })}
                    placeholder="e.g. VIP PROGRAM COMPLETE"
                    disabled={editingAuto.id !== "new"}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5" />
                    In-App Message
                  </Label>
                  <Textarea
                    value={editingAuto.message_content}
                    onChange={(e) => setEditingAuto({ ...editingAuto, message_content: e.target.value })}
                    placeholder="Hey {{client_name}}, your new program is ready! 🎉"
                    rows={3}
                  />
                  <p className="text-[11px] text-muted-foreground">Use {"{{client_name}}"} for the client's name</p>
                </div>

                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    Also Send Email
                  </Label>
                  <Switch
                    checked={editingAuto.send_email}
                    onCheckedChange={(v) => setEditingAuto({ ...editingAuto, send_email: v })}
                  />
                </div>

                {editingAuto.send_email && (
                  <div className="space-y-3 pl-2 border-l-2 border-primary/20">
                    <div className="space-y-1">
                      <Label className="text-xs">Email Subject</Label>
                      <Input
                        value={editingAuto.email_subject || ""}
                        onChange={(e) => setEditingAuto({ ...editingAuto, email_subject: e.target.value })}
                        placeholder="Welcome to your new program!"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Email Body</Label>
                      <Textarea
                        value={editingAuto.email_body || ""}
                        onChange={(e) => setEditingAuto({ ...editingAuto, email_body: e.target.value })}
                        placeholder="Your program has been set up and is ready to go..."
                        rows={4}
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <Label>Active</Label>
                  <Switch
                    checked={editingAuto.is_active}
                    onCheckedChange={(v) => setEditingAuto({ ...editingAuto, is_active: v })}
                  />
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setEditingAuto(null)} className="flex-1">
                    Cancel
                  </Button>
                  <Button onClick={saveAutomation} disabled={savingAuto || !editingAuto.tag_name.trim()} className="flex-1">
                    {savingAuto ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <ScrollArea className="flex-1 max-h-[320px]">
                  <div className="space-y-2">
                    {automations.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-6">
                        No automations yet. Create one to auto-send messages when you tag a client.
                      </p>
                    )}
                    {automations.map((auto) => (
                      <div
                        key={auto.id}
                        className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-secondary/30 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold truncate">{auto.tag_name}</span>
                            {!auto.is_active && (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                Paused
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <MessageSquare className="h-3 w-3 text-muted-foreground" />
                            {auto.send_email && <Mail className="h-3 w-3 text-primary" />}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingAuto({ ...auto })}
                        >
                          Edit
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive"
                          onClick={() => deleteAutomation(auto.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                <Button
                  variant="outline"
                  onClick={() =>
                    setEditingAuto({
                      id: "new",
                      tag_name: "",
                      message_content: "",
                      email_subject: null,
                      email_body: null,
                      send_email: false,
                      is_active: true,
                    })
                  }
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Automation
                </Button>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default TagAutomationDialog;
