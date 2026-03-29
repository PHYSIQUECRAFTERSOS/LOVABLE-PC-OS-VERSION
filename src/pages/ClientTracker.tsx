import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { differenceInDays, format } from "date-fns";
import { Plus, Search, RotateCcw, Pencil, Trash2, ClipboardList, Repeat } from "lucide-react";

interface TrackerRow {
  id: string;
  coach_id: string;
  client_id: string;
  client_name: string;
  weeks: number;
  start_date: string;
  end_date: string;
  revenue: string | null;
  notes: string | null;
  tier_name: string | null;
  is_month_to_month: boolean;
  created_at: string;
  updated_at: string;
}

interface ClientOption {
  id: string;
  name: string;
}

const urgencyColor = (daysLeft: number) => {
  if (daysLeft < 0) return "bg-muted text-muted-foreground line-through";
  if (daysLeft <= 7) return "bg-red-500/20 text-red-400 border-red-500/30";
  if (daysLeft <= 14) return "bg-orange-500/20 text-orange-400 border-orange-500/30";
  if (daysLeft <= 30) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
};

const urgencyLabel = (daysLeft: number) => {
  if (daysLeft < 0) return `${Math.abs(daysLeft)}d expired`;
  if (daysLeft === 0) return "Today";
  return `${daysLeft}d left`;
};

const ClientTracker = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<TrackerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editRow, setEditRow] = useState<TrackerRow | null>(null);
  const [renewRow, setRenewRow] = useState<TrackerRow | null>(null);
  const [renewWeeks, setRenewWeeks] = useState(0);
  const [renewNotes, setRenewNotes] = useState("");
  const [renewConvertM2M, setRenewConvertM2M] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [addForm, setAddForm] = useState({ client_id: "", client_name: "", weeks: 4, start_date: format(new Date(), "yyyy-MM-dd"), revenue: "", notes: "", tier_name: "", is_month_to_month: false });
  const [tiers, setTiers] = useState<{ id: string; name: string; default_weeks: number | null }[]>([]);

  const fetchRows = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("client_program_tracker")
      .select("*")
      .order("end_date", { ascending: true });
    if (error) {
      toast({ title: "Error loading tracker", description: error.message, variant: "destructive" });
    } else {
      setRows(data || []);
    }
    setLoading(false);
  }, [user, toast]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const fetchClients = useCallback(async () => {
    if (!user) return;
    const { data: assignments } = await supabase
      .from("coach_clients")
      .select("client_id")
      .eq("coach_id", user.id)
      .eq("status", "active");
    if (!assignments?.length) return;
    const clientIds = assignments.map((a) => a.client_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", clientIds);
    setClients((profiles || []).map((p) => ({ id: p.user_id, name: p.full_name || "Client" })));
  }, [user]);

  const fetchTiers = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("client_tiers")
      .select("id, name, default_weeks")
      .order("name");
    if (data) setTiers(data);
  }, []);

  useEffect(() => {
    if (addOpen) { fetchClients(); fetchTiers(); }
  }, [addOpen, fetchClients, fetchTiers]);

  const handleAdd = async () => {
    if (!user || !addForm.client_id) return;
    const { error } = await (supabase as any)
      .from("client_program_tracker")
      .insert({
        coach_id: user.id,
        client_id: addForm.client_id,
        client_name: addForm.client_name,
        weeks: addForm.weeks,
        start_date: addForm.start_date,
        revenue: addForm.revenue || null,
        notes: addForm.notes || null,
        tier_name: addForm.tier_name || null,
        is_month_to_month: addForm.is_month_to_month,
      });
    if (error) {
      if (error.code === "23505") {
        toast({ title: "Client already in tracker", variant: "destructive" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
      return;
    }
    toast({ title: "Client added to tracker" });
    setAddOpen(false);
    setAddForm({ client_id: "", client_name: "", weeks: 4, start_date: format(new Date(), "yyyy-MM-dd"), revenue: "", notes: "", tier_name: "", is_month_to_month: false });
    fetchRows();
  };

  const handleUpdate = async () => {
    if (!editRow) return;
    const { error } = await (supabase as any)
      .from("client_program_tracker")
      .update({
        client_name: editRow.client_name,
        weeks: editRow.weeks,
        start_date: editRow.start_date,
        revenue: editRow.revenue,
        notes: editRow.notes,
        tier_name: editRow.tier_name,
        is_month_to_month: editRow.is_month_to_month,
      })
      .eq("id", editRow.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Tracker updated" });
    setEditRow(null);
    fetchRows();
  };

  const handleRenew = async () => {
    if (!renewRow || renewWeeks <= 0) return;
    const newWeeks = renewRow.weeks + renewWeeks;
    const noteAppend = `\nRenewed +${renewWeeks}w on ${format(new Date(), "MMM d, yyyy")}${renewNotes ? ` — ${renewNotes}` : ""}`;
    const updatePayload: Record<string, any> = {
      weeks: newWeeks,
      notes: (renewRow.notes || "") + noteAppend,
    };
    if (renewConvertM2M) {
      updatePayload.is_month_to_month = true;
    }
    const { error } = await (supabase as any)
      .from("client_program_tracker")
      .update(updatePayload)
      .eq("id", renewRow.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: renewConvertM2M ? `Renewed & converted to Month-to-Month` : `Renewed — ${renewWeeks} weeks added` });
    setRenewRow(null);
    setRenewWeeks(0);
    setRenewNotes("");
    setRenewConvertM2M(false);
    fetchRows();
  };

  const handleToggleM2M = async (row: TrackerRow) => {
    const newVal = !row.is_month_to_month;
    const { error } = await (supabase as any)
      .from("client_program_tracker")
      .update({ is_month_to_month: newVal })
      .eq("id", row.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: newVal ? "Converted to Month-to-Month" : "Reverted to Committed" });
    fetchRows();
  };

  const handleDelete = async (id: string) => {
    const { error } = await (supabase as any)
      .from("client_program_tracker")
      .delete()
      .eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Removed from tracker" });
    fetchRows();
  };

  const filtered = rows.filter((r) =>
    r.client_name.toLowerCase().includes(search.toLowerCase()) ||
    (r.tier_name || "").toLowerCase().includes(search.toLowerCase())
  );

  // Sort: committed clients by days left (ascending), M2M clients at bottom
  const sorted = [...filtered].sort((a, b) => {
    if (a.is_month_to_month !== b.is_month_to_month) {
      return a.is_month_to_month ? 1 : -1;
    }
    if (a.is_month_to_month) {
      return a.client_name.localeCompare(b.client_name);
    }
    const aDays = differenceInDays(new Date(a.end_date), new Date());
    const bDays = differenceInDays(new Date(b.end_date), new Date());
    return aDays - bDays;
  });

  const committedCount = filtered.filter(r => !r.is_month_to_month).length;
  const m2mCount = filtered.filter(r => r.is_month_to_month).length;

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-primary" />
              Client Tracker
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Track program durations, renewals & revenue</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search clients..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 w-48"
              />
            </div>
            <Button onClick={() => setAddOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead className="text-center">Weeks</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead>Revenue</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : sorted.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No clients in tracker yet. Click "Add" to get started.</TableCell></TableRow>
                  ) : (
                    <>
                      {sorted.map((row, idx) => {
                        const daysLeft = differenceInDays(new Date(row.end_date), new Date());
                        const isM2M = row.is_month_to_month;
                        // Show separator before first M2M row
                        const showSeparator = isM2M && idx > 0 && !sorted[idx - 1].is_month_to_month;
                        return (
                          <>
                            {showSeparator && (
                              <TableRow key={`sep-${row.id}`}>
                                <TableCell colSpan={9} className="py-1 px-4">
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <div className="flex-1 h-px bg-border" />
                                    <Repeat className="h-3 w-3 text-blue-400" />
                                    <span className="text-blue-400 font-medium">Month-to-Month ({m2mCount})</span>
                                    <div className="flex-1 h-px bg-border" />
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                            <TableRow key={row.id} className="group">
                              <TableCell className="font-medium">{row.client_name}</TableCell>
                              <TableCell className="text-muted-foreground text-sm">{row.tier_name || "—"}</TableCell>
                              <TableCell className="text-center">{row.weeks}</TableCell>
                              <TableCell className="text-sm">{format(new Date(row.start_date), "MMM d, yyyy")}</TableCell>
                              <TableCell className="text-sm">{isM2M ? "—" : format(new Date(row.end_date), "MMM d, yyyy")}</TableCell>
                              <TableCell className="text-center">
                                {isM2M ? (
                                  <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">M2M Active</Badge>
                                ) : (
                                  <Badge className={urgencyColor(daysLeft)}>{urgencyLabel(daysLeft)}</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">{row.revenue || "—"}</TableCell>
                              <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">{row.notes || "—"}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className={`h-7 w-7 p-0 ${isM2M ? "text-blue-400" : "text-muted-foreground"}`}
                                    onClick={() => handleToggleM2M(row)}
                                    title={isM2M ? "Revert to Committed" : "Convert to Month-to-Month"}
                                  >
                                    <Repeat className="h-3.5 w-3.5" />
                                  </Button>
                                  {!isM2M && (
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setRenewRow(row); setRenewWeeks(0); setRenewNotes(""); setRenewConvertM2M(false); }}>
                                      <RotateCcw className="h-3.5 w-3.5 text-primary" />
                                    </Button>
                                  )}
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditRow({ ...row })}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(row.id)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          </>
                        );
                      })}
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Add Dialog */}
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Add Client to Tracker</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Client *</Label>
                <Select value={addForm.client_id} onValueChange={(v) => {
                  const c = clients.find((c) => c.id === v);
                  setAddForm({ ...addForm, client_id: v, client_name: c?.name || "" });
                }}>
                  <SelectTrigger><SelectValue placeholder="Select client..." /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tier</Label>
                <Select value={addForm.tier_name} onValueChange={(v) => {
                  const tier = tiers.find((t) => t.name === v);
                  setAddForm({ ...addForm, tier_name: v, weeks: tier?.default_weeks || addForm.weeks });
                }}>
                  <SelectTrigger><SelectValue placeholder="Select tier..." /></SelectTrigger>
                  <SelectContent>
                    {tiers.map((t) => (
                      <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Weeks</Label>
                  <Input type="number" min={1} value={addForm.weeks} onChange={(e) => setAddForm({ ...addForm, weeks: parseInt(e.target.value) || 1 })} />
                </div>
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input type="date" value={addForm.start_date} onChange={(e) => setAddForm({ ...addForm, start_date: e.target.value })} />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <div>
                  <Label className="text-sm font-medium">Month-to-Month</Label>
                  <p className="text-xs text-muted-foreground">No end date countdown</p>
                </div>
                <Switch checked={addForm.is_month_to_month} onCheckedChange={(v) => setAddForm({ ...addForm, is_month_to_month: v })} />
              </div>
              <div className="space-y-2">
                <Label>Revenue</Label>
                <Input value={addForm.revenue} onChange={(e) => setAddForm({ ...addForm, revenue: e.target.value })} placeholder="$2399 USD 6 month PIF" />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={addForm.notes} onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })} placeholder="Program notes..." rows={2} />
              </div>
              <Button className="w-full" onClick={handleAdd} disabled={!addForm.client_id}>
                <Plus className="h-4 w-4 mr-1" /> Add to Tracker
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={!!editRow} onOpenChange={(o) => { if (!o) setEditRow(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Edit Tracker Entry</DialogTitle></DialogHeader>
            {editRow && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Client Name</Label>
                  <Input value={editRow.client_name} onChange={(e) => setEditRow({ ...editRow, client_name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Tier</Label>
                  <Input value={editRow.tier_name || ""} onChange={(e) => setEditRow({ ...editRow, tier_name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Weeks</Label>
                    <Input type="number" min={1} value={editRow.weeks} onChange={(e) => setEditRow({ ...editRow, weeks: parseInt(e.target.value) || 1 })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input type="date" value={editRow.start_date} onChange={(e) => setEditRow({ ...editRow, start_date: e.target.value })} />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <div>
                    <Label className="text-sm font-medium">Month-to-Month</Label>
                    <p className="text-xs text-muted-foreground">No end date countdown</p>
                  </div>
                  <Switch checked={editRow.is_month_to_month} onCheckedChange={(v) => setEditRow({ ...editRow, is_month_to_month: v })} />
                </div>
                <div className="space-y-2">
                  <Label>Revenue</Label>
                  <Input value={editRow.revenue || ""} onChange={(e) => setEditRow({ ...editRow, revenue: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea value={editRow.notes || ""} onChange={(e) => setEditRow({ ...editRow, notes: e.target.value })} rows={3} />
                </div>
                <Button className="w-full" onClick={handleUpdate}>Save Changes</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Renew Dialog */}
        <Dialog open={!!renewRow} onOpenChange={(o) => { if (!o) setRenewRow(null); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle>Renew — {renewRow?.client_name}</DialogTitle></DialogHeader>
            {renewRow && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Current end date: <span className="text-foreground font-medium">{format(new Date(renewRow.end_date), "MMM d, yyyy")}</span>
                </p>
                <div className="space-y-2">
                  <Label>Add Weeks</Label>
                  <Input type="number" min={1} value={renewWeeks || ""} onChange={(e) => setRenewWeeks(parseInt(e.target.value) || 0)} placeholder="e.g. 26" />
                </div>
                {renewWeeks > 0 && (
                  <p className="text-sm text-primary">
                    New end date: {format(new Date(new Date(renewRow.end_date).getTime() + renewWeeks * 7 * 86400000), "MMM d, yyyy")}
                  </p>
                )}
                <div className="space-y-2">
                  <Label>Renewal Note (optional)</Label>
                  <Input value={renewNotes} onChange={(e) => setRenewNotes(e.target.value)} placeholder="6 month renewal PIF" />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2">
                  <div>
                    <Label className="text-sm font-medium text-blue-400">Convert to Month-to-Month</Label>
                    <p className="text-xs text-muted-foreground">No more countdown after renewal</p>
                  </div>
                  <Switch checked={renewConvertM2M} onCheckedChange={setRenewConvertM2M} />
                </div>
                <Button className="w-full" onClick={handleRenew} disabled={renewWeeks <= 0}>
                  <RotateCcw className="h-4 w-4 mr-1" /> {renewConvertM2M ? "Renew & Convert to M2M" : "Renew"}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default ClientTracker;
