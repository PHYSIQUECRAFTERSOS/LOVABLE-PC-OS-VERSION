import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Plus, Zap, Mail, Send, Clock, Trash2, Pencil, Search, Users, User } from "lucide-react";
import { format } from "date-fns";

const TRIGGER_TYPES = [
  { value: "missed_workout", label: "Missed Workout" },
  { value: "missed_checkin", label: "Missed Check-In" },
  { value: "inactivity_7d", label: "7-Day Inactivity" },
  { value: "goal_milestone", label: "Goal Milestone" },
  { value: "recurring", label: "Recurring Schedule" },
  { value: "broadcast", label: "Broadcast (One-Time)" },
];

const CATEGORIES = [
  { value: "motivational", label: "Motivational" },
  { value: "reminder", label: "Reminder" },
  { value: "milestone", label: "Milestone" },
  { value: "custom", label: "Custom" },
];

const TARGET_TYPES = [
  { value: "all_clients", label: "All Clients" },
  { value: "tag_group", label: "Tag Group" },
  { value: "individual", label: "Individual Client" },
];

const AutoMessagingManager = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Template form
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [tplName, setTplName] = useState("");
  const [tplContent, setTplContent] = useState("");
  const [tplCategory, setTplCategory] = useState("motivational");
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

  // Trigger form
  const [showTriggerForm, setShowTriggerForm] = useState(false);
  const [trigTemplateId, setTrigTemplateId] = useState("");
  const [trigType, setTrigType] = useState("missed_workout");
  const [trigTargetType, setTrigTargetType] = useState("all_clients");
  const [trigTag, setTrigTag] = useState("");
  const [trigClientId, setTrigClientId] = useState("");
  const [trigCron, setTrigCron] = useState("");
  const [editingTriggerId, setEditingTriggerId] = useState<string | null>(null);
  const [excludedClientIds, setExcludedClientIds] = useState<Set<string>>(new Set());
  const [clientSearch, setClientSearch] = useState("");

  // Delete confirmations
  const [deleteTriggerId, setDeleteTriggerId] = useState<string | null>(null);
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);

  // Broadcast form
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastContent, setBroadcastContent] = useState("");
  const [broadcastTarget, setBroadcastTarget] = useState("all_clients");
  const [broadcastTag, setBroadcastTag] = useState("");

  const { data: templates } = useQuery({
    queryKey: ["auto-msg-templates", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auto_message_templates")
        .select("*")
        .eq("coach_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: triggers } = useQuery({
    queryKey: ["auto-msg-triggers", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auto_message_triggers")
        .select("*, auto_message_templates(name)")
        .eq("coach_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: logs } = useQuery({
    queryKey: ["auto-msg-logs", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auto_message_logs")
        .select("*")
        .eq("coach_id", user!.id)
        .order("sent_at", { ascending: false })
        .limit(30);
      if (error) throw error;

      const clientIds = [...new Set(data?.map((l) => l.client_id) || [])];
      if (clientIds.length === 0) return data || [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", clientIds);

      return (data || []).map((l) => ({
        ...l,
        client_name: profiles?.find((p) => p.user_id === l.client_id)?.full_name || "Client",
      }));
    },
    enabled: !!user,
  });

  const { data: clients } = useQuery({
    queryKey: ["coach-clients-automsg", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("coach_clients")
        .select("client_id")
        .eq("coach_id", user!.id)
        .eq("status", "active");
      if (!data) return [];
      const ids = data.map((c) => c.client_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", ids);
      return ids.map((id) => ({
        client_id: id,
        full_name: profiles?.find((p) => p.user_id === id)?.full_name || "Client",
      }));
    },
    enabled: !!user,
  });

  const { data: tags } = useQuery({
    queryKey: ["coach-tags", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_tags")
        .select("tag")
        .eq("coach_id", user!.id);
      if (error) throw error;
      const unique = [...new Set(data?.map((t) => t.tag) || [])];
      return unique;
    },
    enabled: !!user,
  });

  // ── Template mutations ──

  const resetTemplateForm = () => {
    setShowTemplateForm(false);
    setEditingTemplateId(null);
    setTplName("");
    setTplContent("");
    setTplCategory("motivational");
  };

  const saveTemplateMutation = useMutation({
    mutationFn: async () => {
      if (!user || !tplName || !tplContent) throw new Error("Name and content required");
      if (editingTemplateId) {
        const { error } = await supabase
          .from("auto_message_templates")
          .update({ name: tplName, content: tplContent, category: tplCategory })
          .eq("id", editingTemplateId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("auto_message_templates").insert({
          coach_id: user.id,
          name: tplName,
          content: tplContent,
          category: tplCategory,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auto-msg-templates"] });
      toast({ title: editingTemplateId ? "Template updated" : "Template saved" });
      resetTemplateForm();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("auto_message_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auto-msg-templates"] });
      toast({ title: "Template deleted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const startEditTemplate = (t: any) => {
    setEditingTemplateId(t.id);
    setTplName(t.name);
    setTplContent(t.content);
    setTplCategory(t.category);
    setShowTemplateForm(true);
  };

  // ── Trigger mutations ──

  const resetTriggerForm = () => {
    setShowTriggerForm(false);
    setEditingTriggerId(null);
    setTrigTemplateId("");
    setTrigType("missed_workout");
    setTrigTargetType("all_clients");
    setTrigTag("");
    setTrigClientId("");
    setTrigCron("");
    setExcludedClientIds(new Set());
    setClientSearch("");
  };

  const filteredClients = useMemo(() => {
    if (!clients) return [];
    if (!clientSearch.trim()) return clients;
    const q = clientSearch.toLowerCase();
    return clients.filter((c) => c.full_name.toLowerCase().includes(q));
  }, [clients, clientSearch]);

  const toggleClientExclusion = (clientId: string) => {
    setExcludedClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) {
        next.delete(clientId);
      } else {
        next.add(clientId);
      }
      return next;
    });
  };

  const selectAllClients = () => setExcludedClientIds(new Set());
  const deselectAllClients = () => {
    if (!clients) return;
    setExcludedClientIds(new Set(clients.map((c) => c.client_id)));
  };

  const saveTriggerMutation = useMutation({
    mutationFn: async () => {
      if (!user || !trigTemplateId) throw new Error("Select a template");
      const payload = {
        template_id: trigTemplateId,
        trigger_type: trigType,
        target_type: trigTargetType,
        target_tag: trigTargetType === "tag_group" ? trigTag : null,
        target_client_id: trigTargetType === "individual" ? trigClientId : null,
        recurrence_cron: trigType === "recurring" ? trigCron : null,
      };
      if (editingTriggerId) {
        const { error } = await supabase
          .from("auto_message_triggers")
          .update(payload)
          .eq("id", editingTriggerId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("auto_message_triggers").insert({
          coach_id: user.id,
          ...payload,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auto-msg-triggers"] });
      toast({ title: editingTriggerId ? "Trigger updated" : "Trigger created" });
      resetTriggerForm();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteTriggerMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("auto_message_triggers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auto-msg-triggers"] });
      toast({ title: "Trigger deleted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const startEditTrigger = (t: any) => {
    setEditingTriggerId(t.id);
    setTrigTemplateId(t.template_id);
    setTrigType(t.trigger_type);
    setTrigTargetType(t.target_type);
    setTrigTag(t.target_tag || "");
    setTrigClientId(t.target_client_id || "");
    setTrigCron(t.recurrence_cron || "");
    setShowTriggerForm(true);
  };

  const toggleTriggerMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("auto_message_triggers")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auto-msg-triggers"] }),
  });

  // ── Broadcast ──

  const broadcastMutation = useMutation({
    mutationFn: async () => {
      if (!user || !broadcastContent) throw new Error("Message content required");
      let targetClients: string[] = [];

      if (broadcastTarget === "all_clients") {
        targetClients = clients?.map((c) => c.client_id) || [];
      } else if (broadcastTarget === "tag_group" && broadcastTag) {
        const { data: tagged } = await supabase
          .from("client_tags")
          .select("client_id")
          .eq("coach_id", user.id)
          .eq("tag", broadcastTag);
        targetClients = tagged?.map((t) => t.client_id) || [];
      }

      if (targetClients.length === 0) throw new Error("No clients to send to");

      const logEntries = targetClients.map((clientId) => ({
        coach_id: user.id,
        client_id: clientId,
        message_content: broadcastContent,
        trigger_reason: "broadcast",
      }));

      const { error } = await supabase.from("auto_message_logs").insert(logEntries);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auto-msg-logs"] });
      toast({ title: `Broadcast sent to ${broadcastTarget === "all_clients" ? "all clients" : broadcastTag}` });
      setShowBroadcast(false);
      setBroadcastContent("");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Automated Messaging</h3>
        <Button size="sm" variant="outline" onClick={() => setShowBroadcast(!showBroadcast)}>
          <Send className="h-4 w-4 mr-1" /> Broadcast
        </Button>
      </div>

      {/* Broadcast Form */}
      {showBroadcast && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Send Broadcast</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Target</Label>
              <Select value={broadcastTarget} onValueChange={setBroadcastTarget}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_clients">All Clients</SelectItem>
                  <SelectItem value="tag_group">Tag Group</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {broadcastTarget === "tag_group" && (
              <div className="space-y-2">
                <Label>Tag</Label>
                <Select value={broadcastTag} onValueChange={setBroadcastTag}>
                  <SelectTrigger><SelectValue placeholder="Select tag" /></SelectTrigger>
                  <SelectContent>
                    {tags?.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea value={broadcastContent} onChange={(e) => setBroadcastContent(e.target.value)} rows={3} placeholder="Your message to clients..." />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => broadcastMutation.mutate()} disabled={!broadcastContent}>Send Now</Button>
              <Button variant="outline" onClick={() => setShowBroadcast(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="triggers" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="triggers">Triggers</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Triggers Tab */}
        <TabsContent value="triggers" className="space-y-4 mt-4">
          <Button size="sm" onClick={() => { resetTriggerForm(); setShowTriggerForm(true); }}>
            <Plus className="h-4 w-4 mr-1" /> New Trigger
          </Button>

          {showTriggerForm && (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Trigger Type</Label>
                    <Select value={trigType} onValueChange={setTrigType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TRIGGER_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Message Template</Label>
                    <Select value={trigTemplateId} onValueChange={setTrigTemplateId}>
                      <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
                      <SelectContent>
                        {templates?.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Target</Label>
                    <Select value={trigTargetType} onValueChange={setTrigTargetType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TARGET_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {trigTargetType === "tag_group" && (
                    <div className="space-y-2">
                      <Label>Tag</Label>
                      <Select value={trigTag} onValueChange={setTrigTag}>
                        <SelectTrigger><SelectValue placeholder="Select tag" /></SelectTrigger>
                        <SelectContent>
                          {tags?.map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {trigTargetType === "individual" && (
                    <div className="space-y-2">
                      <Label>Client</Label>
                      <Select value={trigClientId} onValueChange={setTrigClientId}>
                        <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                        <SelectContent>
                          {clients?.map((c) => (
                            <SelectItem key={c.client_id} value={c.client_id}>{c.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {trigType === "recurring" && (
                    <div className="space-y-2">
                      <Label>Schedule (Cron)</Label>
                      <Input value={trigCron} onChange={(e) => setTrigCron(e.target.value)} placeholder="0 9 * * 1 (Mon 9am)" />
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => saveTriggerMutation.mutate()} disabled={!trigTemplateId}>
                    {editingTriggerId ? "Update Trigger" : "Create Trigger"}
                  </Button>
                  <Button variant="outline" onClick={resetTriggerForm}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {triggers && triggers.length > 0 ? (
            <div className="space-y-2">
              {triggers.map((t: any) => (
                <Card key={t.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Zap className="h-4 w-4 text-primary" />
                        <div>
                          <p className="text-sm font-medium">
                            {TRIGGER_TYPES.find((tt) => tt.value === t.trigger_type)?.label || t.trigger_type}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Template: {t.auto_message_templates?.name} · Target: {t.target_type}
                            {t.target_tag && ` (${t.target_tag})`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => startEditTrigger(t)}
                          title="Edit trigger"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTriggerId(t.id)}
                          title="Delete trigger"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        <Switch
                          checked={t.is_active}
                          onCheckedChange={(v) => toggleTriggerMutation.mutate({ id: t.id, is_active: v })}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No triggers configured yet.</p>
          )}
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-4 mt-4">
          <Button size="sm" onClick={() => { resetTemplateForm(); setShowTemplateForm(true); }}>
            <Plus className="h-4 w-4 mr-1" /> New Template
          </Button>

          {showTemplateForm && (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Monday Motivation" />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={tplCategory} onValueChange={setTplCategory}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Message Content</Label>
                  <Textarea value={tplContent} onChange={(e) => setTplContent(e.target.value)} rows={3} placeholder="Hey {name}, just checking in..." />
                  <p className="text-xs text-muted-foreground">Use {"{name}"} for client name personalization</p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => saveTemplateMutation.mutate()} disabled={!tplName || !tplContent}>
                    {editingTemplateId ? "Update Template" : "Save Template"}
                  </Button>
                  <Button variant="outline" onClick={resetTemplateForm}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {templates && templates.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {templates.map((t) => (
                <Card key={t.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">{t.name}</span>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="text-xs">{t.category}</Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => startEditTemplate(t)}
                          title="Edit template"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTemplateId(t.id)}
                          title="Delete template"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{t.content}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No templates yet.</p>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4 mt-4">
          {logs && logs.length > 0 ? (
            <div className="space-y-2">
              {logs.map((l: any) => (
                <div key={l.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div>
                    <p className="text-sm font-medium">{l.client_name}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">{l.message_content}</p>
                    {l.trigger_reason && (
                      <Badge variant="secondary" className="text-xs mt-1">{l.trigger_reason}</Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 ml-2">
                    {format(new Date(l.sent_at), "MMM d, h:mm a")}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No messages sent yet.</p>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete Trigger Confirmation */}
      <AlertDialog open={!!deleteTriggerId} onOpenChange={(open) => !open && setDeleteTriggerId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Trigger?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this trigger. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTriggerId) deleteTriggerMutation.mutate(deleteTriggerId);
                setDeleteTriggerId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Template Confirmation */}
      <AlertDialog open={!!deleteTemplateId} onOpenChange={(open) => !open && setDeleteTemplateId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this template. Triggers using it will stop working. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTemplateId) deleteTemplateMutation.mutate(deleteTemplateId);
                setDeleteTemplateId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AutoMessagingManager;
