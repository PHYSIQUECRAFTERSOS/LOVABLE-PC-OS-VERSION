import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Pencil, FileText, X } from "lucide-react";
import SignatureRecordsTable from "@/components/signing/SignatureRecordsTable";

interface DocumentTemplate {
  id: string;
  template_key: string;
  document_type: string;
  tier_applicability: string[] | null;
  title: string;
  body: string;
  version: string;
  is_active: boolean;
  updated_at: string;
}

const DocumentManagement = () => {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingDoc, setEditingDoc] = useState<DocumentTemplate | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("document_templates")
      .select("*")
      .order("document_type")
      .order("template_key");

    if (error) console.error("[DocMgmt] Load error:", error);
    setTemplates((data as DocumentTemplate[]) || []);
    setLoading(false);
  };

  const handleEdit = (doc: DocumentTemplate) => {
    setEditingDoc(doc);
    setEditBody(doc.body);
    setEditTitle(doc.title);
  };

  const handleSaveVersion = async () => {
    if (!editingDoc) return;
    setSaving(true);

    // Deactivate old version
    await supabase
      .from("document_templates")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", editingDoc.id);

    // Increment version
    const currentVersion = parseInt(editingDoc.version.replace("v", "")) || 1;
    const newVersion = `v${currentVersion + 1}`;

    // Create new version row
    const { error } = await supabase
      .from("document_templates")
      .insert({
        template_key: editingDoc.template_key,
        document_type: editingDoc.document_type,
        tier_applicability: editingDoc.tier_applicability,
        title: editTitle,
        body: editBody,
        version: newVersion,
        is_active: true,
      });

    if (error) {
      console.error("[DocMgmt] Save error:", error);
      toast({ title: "Error saving document", variant: "destructive" });
    } else {
      toast({ title: `Document updated to ${newVersion} ✓` });
      setEditingDoc(null);
      loadTemplates();
    }
    setSaving(false);
  };

  const handleToggleActive = async (doc: DocumentTemplate) => {
    const { error } = await supabase
      .from("document_templates")
      .update({ is_active: !doc.is_active, updated_at: new Date().toISOString() })
      .eq("id", doc.id);

    if (error) {
      toast({ title: "Error", variant: "destructive" });
    } else {
      loadTemplates();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Document Templates
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {templates.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between rounded-lg border border-border p-3"
            >
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">{doc.title}</span>
                  <Badge variant={doc.is_active ? "default" : "secondary"} className="text-[10px]">
                    {doc.version}
                  </Badge>
                  {!doc.is_active && (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      Inactive
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{doc.document_type}</span>
                  <span>•</span>
                  <span>
                    {doc.tier_applicability
                      ? doc.tier_applicability.join(", ")
                      : "All tiers"}
                  </span>
                  <span>•</span>
                  <span>{new Date(doc.updated_at).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Switch
                  checked={doc.is_active}
                  onCheckedChange={() => handleToggleActive(doc)}
                />
                <Button variant="ghost" size="sm" onClick={() => handleEdit(doc)}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <SignatureRecordsTable viewMode="admin" />

      {/* Edit Modal */}
      <Dialog open={!!editingDoc} onOpenChange={(open) => !open && setEditingDoc(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Document — {editingDoc?.template_key}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Document Body</Label>
              <Textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                className="min-h-[400px] font-mono text-xs"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Saving will create a new version ({editingDoc?.version} → v
              {parseInt(editingDoc?.version.replace("v", "") || "1") + 1}) and deactivate the
              previous version. Existing signatures are preserved.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEditingDoc(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveVersion} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save New Version
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DocumentManagement;
