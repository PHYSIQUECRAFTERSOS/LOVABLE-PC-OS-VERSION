import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Upload, FileText, Clock, Eye, Trash2, Download, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";

interface MealPlanUpload {
  id: string;
  client_id: string;
  coach_id: string;
  storage_path: string;
  file_name: string;
  version: number;
  coach_notes: string | null;
  effective_date: string;
  is_active: boolean;
  client_viewed_at: string | null;
  created_at: string;
  updated_at: string;
}

const CoachMealPlanUpload = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [uploading, setUploading] = useState(false);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);

  const { data: clients } = useQuery({
    queryKey: ["coach-clients-for-plans", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coach_clients")
        .select("client_id, profiles!inner(user_id, full_name)")
        .eq("coach_id", user!.id)
        .eq("status", "active");

      if (error) {
        // Fallback: fetch without join
        const { data: clientData } = await supabase
          .from("coach_clients")
          .select("client_id")
          .eq("coach_id", user!.id)
          .eq("status", "active");

        if (!clientData) return [];

        const clientIds = clientData.map((c) => c.client_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", clientIds);

        return clientIds.map((id) => ({
          client_id: id,
          full_name: profiles?.find((p) => p.user_id === id)?.full_name || "Unknown Client",
        }));
      }

      return (data || []).map((d: any) => ({
        client_id: d.client_id,
        full_name: d.profiles?.full_name || "Unknown Client",
      }));
    },
    enabled: !!user,
  });

  const { data: uploads } = useQuery({
    queryKey: ["coach-meal-plan-uploads", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coach_meal_plan_uploads")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as MealPlanUpload[];
    },
    enabled: !!user,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file || !selectedClient || !user) throw new Error("Missing required fields");
      setUploading(true);

      // Get next version number
      const existingVersions = uploads?.filter((u) => u.client_id === selectedClient) || [];
      const nextVersion = existingVersions.length > 0 
        ? Math.max(...existingVersions.map((u) => u.version)) + 1 
        : 1;

      const filePath = `${selectedClient}/${Date.now()}_v${nextVersion}_${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("meal-plans")
        .upload(filePath, file, { contentType: file.type });

      if (uploadError) throw uploadError;

      // Deactivate previous versions
      if (existingVersions.length > 0) {
        await supabase
          .from("coach_meal_plan_uploads")
          .update({ is_active: false })
          .eq("client_id", selectedClient)
          .eq("coach_id", user.id);
      }

      const { error: dbError } = await supabase
        .from("coach_meal_plan_uploads")
        .insert({
          client_id: selectedClient,
          coach_id: user.id,
          storage_path: filePath,
          file_name: file.name,
          version: nextVersion,
          coach_notes: notes || null,
          effective_date: effectiveDate,
          is_active: true,
        });

      if (dbError) throw dbError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coach-meal-plan-uploads"] });
      setFile(null);
      setNotes("");
      setSelectedClient("");
      toast({ title: "Meal plan uploaded", description: "Client can now view the new plan." });
      setUploading(false);
    },
    onError: (err: any) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      setUploading(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (upload: MealPlanUpload) => {
      await supabase.storage.from("meal-plans").remove([upload.storage_path]);
      const { error } = await supabase
        .from("coach_meal_plan_uploads")
        .delete()
        .eq("id", upload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coach-meal-plan-uploads"] });
      toast({ title: "Plan removed" });
    },
  });

  const handleDownload = async (upload: MealPlanUpload) => {
    const { data } = await supabase.storage
      .from("meal-plans")
      .createSignedUrl(upload.storage_path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  // Group uploads by client
  const groupedUploads = (uploads || []).reduce<Record<string, MealPlanUpload[]>>((acc, u) => {
    if (!acc[u.client_id]) acc[u.client_id] = [];
    acc[u.client_id].push(u);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Upload Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Upload className="h-5 w-5 text-primary" />
            Upload Meal Plan
          </CardTitle>
          <CardDescription>Upload a PDF meal plan for a client. Previous versions are archived automatically.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients?.map((c) => (
                    <SelectItem key={c.client_id} value={c.client_id}>
                      {c.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Effective Date</Label>
              <Input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>PDF File</Label>
            <Input
              type="file"
              accept=".pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="cursor-pointer"
            />
          </div>

          <div className="space-y-2">
            <Label>Coach Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about this meal plan version..."
              rows={3}
            />
          </div>

          <Button
            onClick={() => uploadMutation.mutate()}
            disabled={!file || !selectedClient || uploading}
            className="w-full md:w-auto"
          >
            <Upload className="h-4 w-4 mr-2" />
            {uploading ? "Uploading..." : "Upload Meal Plan"}
          </Button>
        </CardContent>
      </Card>

      {/* Version History by Client */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Uploaded Plans</CardTitle>
          <CardDescription>Version history for each client's meal plans.</CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(groupedUploads).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No meal plans uploaded yet.
            </p>
          ) : (
            <div className="space-y-3">
              {Object.entries(groupedUploads).map(([clientId, clientUploads]) => {
                const clientName = clients?.find((c) => c.client_id === clientId)?.full_name || "Client";
                const isExpanded = expandedClient === clientId;
                const activeUpload = clientUploads.find((u) => u.is_active);

                return (
                  <div key={clientId} className="border rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpandedClient(isExpanded ? null : clientId)}
                      className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-primary" />
                        <span className="font-medium text-sm">{clientName}</span>
                        <Badge variant={activeUpload ? "default" : "secondary"} className="text-xs">
                          v{activeUpload?.version || clientUploads[0].version}
                        </Badge>
                        {activeUpload?.client_viewed_at && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Eye className="h-3 w-3" />
                            Viewed
                          </Badge>
                        )}
                      </div>
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>

                    {isExpanded && (
                      <div className="border-t divide-y">
                        {clientUploads.map((upload) => (
                          <div key={upload.id} className="p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{upload.file_name}</span>
                                <Badge variant={upload.is_active ? "default" : "secondary"} className="text-xs">
                                  v{upload.version} {upload.is_active && "• Active"}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button size="sm" variant="ghost" onClick={() => handleDownload(upload)}>
                                  <Download className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => deleteMutation.mutate(upload)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Uploaded {format(new Date(upload.created_at), "MMM d, yyyy")}
                              </span>
                              <span>Effective: {format(new Date(upload.effective_date), "MMM d, yyyy")}</span>
                              {upload.client_viewed_at && (
                                <span className="flex items-center gap-1">
                                  <Eye className="h-3 w-3" />
                                  Viewed {format(new Date(upload.client_viewed_at), "MMM d, h:mm a")}
                                </span>
                              )}
                            </div>

                            {upload.coach_notes && (
                              <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2 mt-1">
                                {upload.coach_notes}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CoachMealPlanUpload;
