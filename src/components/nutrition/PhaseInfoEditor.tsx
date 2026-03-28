import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Save, Target } from "lucide-react";
import { toast } from "sonner";
import { PHASE_TEMPLATES } from "@/constants/phaseTemplates";


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

  const handleCurrentPhaseSelect = (phaseName: string) => {
    if (phaseName === "custom") {
      setForm((f) => ({ ...f, current_phase_name: "", current_phase_description: "" }));
      return;
    }
    const template = PHASE_TEMPLATES.find((p) => p.name === phaseName);
    if (!template) return;
    const nextTemplate = PHASE_TEMPLATES.find((p) => p.name === template.nextPhase);
    setForm((f) => ({
      ...f,
      current_phase_name: template.name,
      current_phase_description: template.description,
      ...(nextTemplate
        ? { next_phase_name: nextTemplate.name, next_phase_description: nextTemplate.description }
        : {}),
    }));
  };

  const handleNextPhaseSelect = (phaseName: string) => {
    if (phaseName === "custom") {
      setForm((f) => ({ ...f, next_phase_name: "", next_phase_description: "" }));
      return;
    }
    const template = PHASE_TEMPLATES.find((p) => p.name === phaseName);
    if (!template) return;
    setForm((f) => ({
      ...f,
      next_phase_name: template.name,
      next_phase_description: template.description,
    }));
  };

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

  const currentPhaseIsTemplate = PHASE_TEMPLATES.some((p) => p.name === form.current_phase_name);
  const nextPhaseIsTemplate = PHASE_TEMPLATES.some((p) => p.name === form.next_phase_name);

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
            {form.current_phase_name && (
              <Badge variant="outline" className="w-fit border-primary/40 text-primary text-xs">
                Current: {form.current_phase_name}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">Current Phase</Label>
                <Select
                  value={currentPhaseIsTemplate ? form.current_phase_name : "custom"}
                  onValueChange={handleCurrentPhaseSelect}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select phase" />
                  </SelectTrigger>
                  <SelectContent>
                    {PHASE_TEMPLATES.map((p) => (
                      <SelectItem key={p.name} value={p.name}>
                        {p.name}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Next Phase</Label>
                <Select
                  value={nextPhaseIsTemplate ? form.next_phase_name : "custom"}
                  onValueChange={handleNextPhaseSelect}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select phase" />
                  </SelectTrigger>
                  <SelectContent>
                    {PHASE_TEMPLATES.map((p) => (
                      <SelectItem key={p.name} value={p.name}>
                        {p.name}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Current Phase Description</Label>
              <Textarea
                value={form.current_phase_description}
                onChange={(e) => setForm((f) => ({ ...f, current_phase_description: e.target.value }))}
                placeholder="Auto-filled from template — editable if needed"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Next Phase Description</Label>
              <Textarea
                value={form.next_phase_description}
                onChange={(e) => setForm((f) => ({ ...f, next_phase_description: e.target.value }))}
                placeholder="Auto-filled from template — editable if needed"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Coach Notes</Label>
              <Textarea
                value={form.coach_notes}
                onChange={(e) => setForm((f) => ({ ...f, coach_notes: e.target.value }))}
                placeholder="Notes about this phase for the client..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">📝 Additional Notes (Client-specific)</Label>
              <Textarea
                value={form.additional_notes}
                onChange={(e) => setForm((f) => ({ ...f, additional_notes: e.target.value }))}
                placeholder="Any additional notes specific to this client..."
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
