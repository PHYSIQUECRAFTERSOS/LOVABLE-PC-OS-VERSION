import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { FileUp, ClipboardList, Download, Trash2, Upload, Maximize2 } from "lucide-react";
import { format } from "date-fns";
import MealPlanBuilder from "@/components/nutrition/MealPlanBuilder";

const MealPlanTab = ({ clientId }: { clientId: string }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [uploads, setUploads] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [viewingPdf, setViewingPdf] = useState<{ url: string; name: string } | null>(null);
  const [builderKey, setBuilderKey] = useState(0);

  useEffect(() => {
    loadPlans();
  }, [clientId]);

  useEffect(() => {
    if (!loading && uploads.length > 0 && !viewingPdf) {
      const active = uploads.find(u => u.is_active) || uploads[0];
      if (active) openPdfViewer(active.storage_path, active.file_name);
    }
  }, [loading, uploads]);

  const loadPlans = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("coach_meal_plan_uploads")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    setUploads(data || []);
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
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${clientId}/${Date.now()}_${safeName}`;
    const { error: uploadErr } = await supabase.storage
      .from("meal-plans")
      .upload(path, file);

    if (uploadErr) {
      toast({ title: "Upload failed", description: uploadErr.message, variant: "destructive" });
      setUploading(false);
      return;
    }

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
      openPdfViewer(path, file.name);
    }
    setUploading(false);
  };

  const deletePdf = async (id: string, path: string) => {
    await supabase.storage.from("meal-plans").remove([path]);
    await supabase.from("coach_meal_plan_uploads").delete().eq("id", id);
    toast({ title: "PDF deleted" });
    if (viewingPdf) setViewingPdf(null);
    loadPlans();
  };

  const openPdfViewer = async (path: string, fileName: string) => {
    const { data } = await supabase.storage.from("meal-plans").createSignedUrl(path, 3600);
    if (data?.signedUrl) {
      setViewingPdf({ url: data.signedUrl, name: fileName });
    }
  };

  const downloadPdf = async (path: string) => {
    const { data } = await supabase.storage.from("meal-plans").createSignedUrl(path, 300);
    if (data?.signedUrl) {
      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.download = "";
      a.target = "_blank";
      a.click();
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
    <Tabs defaultValue="builder" className="space-y-4">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="builder" className="gap-1.5">
          <ClipboardList className="h-3.5 w-3.5" /> Build Plan
        </TabsTrigger>
        <TabsTrigger value="pdf" className="gap-1.5">
          <FileUp className="h-3.5 w-3.5" /> PDF Upload
        </TabsTrigger>
      </TabsList>

      <TabsContent value="builder">
        <MealPlanBuilder
          key={builderKey}
          clientId={clientId}
          onSaved={() => setBuilderKey(k => k + 1)}
        />
      </TabsContent>

      <TabsContent value="pdf" className="space-y-4">
        {viewingPdf && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm truncate">{viewingPdf.name}</CardTitle>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                    const active = uploads.find(u => u.is_active) || uploads[0];
                    if (active) downloadPdf(active.storage_path);
                  }}>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => window.open(viewingPdf.url, "_blank")}>
                    <Maximize2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <iframe
                src={`${viewingPdf.url}#toolbar=1&navpanes=0`}
                className="w-full border-0 rounded-b-lg"
                style={{ height: "70vh", minHeight: "500px" }}
                title="Meal Plan PDF"
              />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Upload className="h-4 w-4 text-primary" />
              {viewingPdf ? "Replace Meal Plan PDF" : "Upload Meal Plan PDF"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/30 transition-colors">
              <FileUp className="h-6 w-6 text-muted-foreground mb-1" />
              <span className="text-sm text-muted-foreground">
                {uploading ? "Uploading..." : "Drop PDF here or click to upload"}
              </span>
              <span className="text-[10px] text-muted-foreground mt-0.5">Max 10MB</span>
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

        {uploads.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">All Uploaded Plans</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {uploads.map(upload => (
                <div key={upload.id} className={`flex items-center justify-between py-2 px-3 border rounded-lg cursor-pointer transition-colors ${viewingPdf?.name === upload.file_name ? "border-primary bg-primary/5" : "hover:bg-muted/30"}`}
                  onClick={() => openPdfViewer(upload.storage_path, upload.file_name)}>
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
                  <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => downloadPdf(upload.storage_path)}>
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
    </Tabs>
  );
};

export default MealPlanTab;
