import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { FileUp, ClipboardList, Download, Trash2, Eye, Upload } from "lucide-react";
import { format } from "date-fns";
import MealPlanBuilder from "@/components/nutrition/MealPlanBuilder";

const MealPlanTab = ({ clientId }: { clientId: string }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [uploads, setUploads] = useState<any[]>([]);
  const [structuredPlans, setStructuredPlans] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadPlans();
  }, [clientId]);

  const loadPlans = async () => {
    setLoading(true);
    const [uploadsRes, plansRes] = await Promise.all([
      supabase
        .from("coach_meal_plan_uploads")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
      supabase
        .from("meal_plans")
        .select("id, name, created_at, is_template")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    setUploads(uploadsRes.data || []);
    setStructuredPlans(plansRes.data || []);
    setLoading(false);
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 10MB", variant: "destructive" });
      return;
    }

    setUploading(true);
    const path = `${clientId}/${Date.now()}_${file.name}`;
    const { error: uploadErr } = await supabase.storage
      .from("meal-plans")
      .upload(path, file);

    if (uploadErr) {
      toast({ title: "Upload failed", description: uploadErr.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    // Deactivate old plans
    await supabase
      .from("coach_meal_plan_uploads")
      .update({ is_active: false })
      .eq("client_id", clientId)
      .eq("is_active", true);

    const { error: insertErr } = await supabase.from("coach_meal_plan_uploads").insert({
      client_id: clientId,
      coach_id: user.id,
      file_name: file.name,
      storage_path: path,
      is_active: true,
      version: (uploads.length || 0) + 1,
    });

    if (insertErr) {
      toast({ title: "Error saving", description: insertErr.message, variant: "destructive" });
    } else {
      toast({ title: "Meal plan PDF uploaded" });
      loadPlans();
    }
    setUploading(false);
  };

  const deletePdf = async (id: string, path: string) => {
    await supabase.storage.from("meal-plans").remove([path]);
    await supabase.from("coach_meal_plan_uploads").delete().eq("id", id);
    toast({ title: "PDF deleted" });
    loadPlans();
  };

  const downloadPdf = async (path: string, fileName: string) => {
    const { data } = await supabase.storage.from("meal-plans").createSignedUrl(path, 300);
    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank");
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 rounded-lg" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  return (
    <Tabs defaultValue="pdf" className="space-y-4">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="pdf" className="gap-1.5">
          <FileUp className="h-3.5 w-3.5" /> PDF Upload
        </TabsTrigger>
        <TabsTrigger value="builder" className="gap-1.5">
          <ClipboardList className="h-3.5 w-3.5" /> Build Plan
        </TabsTrigger>
      </TabsList>

      {/* PDF Upload Mode */}
      <TabsContent value="pdf" className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Upload className="h-4 w-4 text-primary" />
              Upload Meal Plan PDF
            </CardTitle>
          </CardHeader>
          <CardContent>
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/30 transition-colors">
              <FileUp className="h-8 w-8 text-muted-foreground mb-2" />
              <span className="text-sm text-muted-foreground">
                {uploading ? "Uploading..." : "Drop PDF here or click to upload"}
              </span>
              <span className="text-[10px] text-muted-foreground mt-1">Max 10MB</span>
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handlePdfUpload}
                disabled={uploading}
              />
            </label>
          </CardContent>
        </Card>

        {/* Uploaded PDFs */}
        {uploads.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Uploaded Plans</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {uploads.map(upload => (
                <div key={upload.id} className="flex items-center justify-between py-2 px-3 border rounded-lg">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileUp className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{upload.file_name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        v{upload.version} · {format(new Date(upload.created_at), "MMM d, yyyy")}
                      </p>
                    </div>
                    {upload.is_active && <Badge className="text-[9px] h-4 shrink-0">Active</Badge>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => downloadPdf(upload.storage_path, upload.file_name)}>
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deletePdf(upload.id, upload.storage_path)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </TabsContent>

      {/* Builder Mode */}
      <TabsContent value="builder">
        <MealPlanBuilder />
      </TabsContent>
    </Tabs>
  );
};

export default MealPlanTab;
