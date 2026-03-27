import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Target } from "lucide-react";
import { toast } from "sonner";

const PhaseInfoEditor = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [form, setForm] = useState({
    current_phase_name: "",
    current_phase_description: "",
    next_phase_name: "",
    next_phase_description: "",
    coach_notes: "",
    additional_notes: "",
  });
  const [saving, setSaving] = useState(false);

  // Fetch clients
  const { data: clients } = useQuery({
    queryKey: ["coach-clients-list", user?.id],
    queryFn: async () => {
      const { data: links, error } = await supabase
        .from("coach_clients")
        .select("client_id")
        .eq("coach_id", user!.id)
        .eq("status", "active");
      if (error) throw error;
      if (!links || links.length === 0) return [];
      const ids = links.map((l: any) => l.client_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", ids);
      return profiles || [];
    },
    enabled: !!user,
  });

  // Fetch phase info for selected client
  const { data: phaseInfo } = useQuery({
    queryKey: ["client-phase-info-edit", selectedClientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_phase_info")
        .select("*")
        .eq("client_id", selectedClientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedClientId,
  });

  useEffect(() => {
    if (phaseInfo) {
      setForm({
        current_phase_name: phaseInfo.current_phase_name || "",
        current_phase_description: phaseInfo.current_phase_description || "",
        next_phase_name: phaseInfo.next_phase_name || "",
        next_phase_description: phaseInfo.next_phase_description || "",
        coach_notes: phaseInfo.coach_notes || "",
        additional_notes: (phaseInfo as any).additional_notes || "",
      });
    } else {
      setForm({
        current_phase_name: "",
        current_phase_description: "",
        next_phase_name: "",
        next_phase_description: "",
        coach_notes: "",
        additional_notes: "",
      });
    }
  }, [phaseInfo, selectedClientId]);

  const handleSave = async () => {
    if (!user || !selectedClientId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("client_phase_info")
        .upsert(
          {
            client_id: selectedClientId,
            coach_id: user.id,
            ...form,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "client_id" }
        );
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["client-phase-info-edit", selectedClientId] });
      toast.success("Phase info saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Set phase information per client. This shows on their Plan tab.
      </p>

      <Select value={selectedClientId} onValueChange={setSelectedClientId}>
        <SelectTrigger>
          <SelectValue placeholder="Select a client" />
        </SelectTrigger>
        <SelectContent>
          {clients?.map((c: any) => (
            <SelectItem key={c.user_id} value={c.user_id}>
              {c.full_name || "Unnamed Client"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedClientId && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Target className="h-4 w-4 text-primary" />
              Phase Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">Current Phase Name</Label>
                <Input
                  value={form.current_phase_name}
                  onChange={(e) => setForm((f) => ({ ...f, current_phase_name: e.target.value }))}
                  placeholder="e.g. Cut Phase"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Next Phase Name</Label>
                <Input
                  value={form.next_phase_name}
                  onChange={(e) => setForm((f) => ({ ...f, next_phase_name: e.target.value }))}
                  placeholder="e.g. Maintenance"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Current Phase Description</Label>
              <Textarea
                value={form.current_phase_description}
                onChange={(e) => setForm((f) => ({ ...f, current_phase_description: e.target.value }))}
                placeholder="Describe the current phase goals, focus areas..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Next Phase Description</Label>
              <Textarea
                value={form.next_phase_description}
                onChange={(e) => setForm((f) => ({ ...f, next_phase_description: e.target.value }))}
                placeholder="Describe what comes next..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Coach Notes</Label>
              <Textarea
                value={form.coach_notes}
                onChange={(e) => setForm((f) => ({ ...f, coach_notes: e.target.value }))}
                placeholder="Additional notes for the client..."
                rows={4}
              />
            </div>

            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : "Save Phase Info"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PhaseInfoEditor;
