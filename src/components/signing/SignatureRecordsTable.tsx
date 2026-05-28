import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, FileText, ChevronRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import SignedDocumentPreviewDialog, {
  type PreviewDocument,
} from "./SignedDocumentPreviewDialog";

interface SignatureRecord {
  id: string;
  client_id: string;
  document_template_id: string | null;
  document_version: string;
  signed_name: string;
  signed_at: string;
  tier_at_signing: string;
  ip_address: string | null;
  pdf_storage_path: string | null;
  document_templates: {
    title: string;
    template_key: string;
  } | null;
}

interface Props {
  /** "admin" shows all, "coach" shows assigned clients, "client" shows own */
  viewMode: "admin" | "coach" | "client";
  /** If provided, filter to a specific client */
  clientId?: string;
}

const SignatureRecordsTable = ({ viewMode, clientId }: Props) => {
  const { user } = useAuth();
  const [records, setRecords] = useState<SignatureRecord[]>([]);
  const [clientNames, setClientNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [preview, setPreview] = useState<PreviewDocument | null>(null);

  useEffect(() => {
    loadRecords();
  }, [user, clientId]);

  const loadRecords = async () => {
    if (!user) return;
    setLoading(true);

    let query = supabase
      .from("client_signatures")
      .select("*, document_templates(title, template_key)")
      .order("signed_at", { ascending: false });

    if (clientId) {
      query = query.eq("client_id", clientId);
    } else if (viewMode === "client") {
      query = query.eq("client_id", user.id);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[SignatureRecords] Load error:", error);
    }

    const rows = (data as any[]) || [];
    setRecords(rows);

    // Resolve client display names (best-effort; falls back to signed_name)
    const ids = Array.from(new Set(rows.map((r) => r.client_id)));
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", ids);
      const map: Record<string, string> = {};
      (profs || []).forEach((p: any) => {
        if (p?.user_id) map[p.user_id] = p.full_name || "";
      });
      setClientNames(map);
    }

    setLoading(false);
  };

  const filteredRecords = useMemo(
    () =>
      tierFilter === "all"
        ? records
        : records.filter((r) => r.tier_at_signing === tierFilter),
    [records, tierFilter]
  );

  const uniqueTiers = useMemo(
    () => [...new Set(records.map((r) => r.tier_at_signing))],
    [records]
  );

  const openPreview = (record: SignatureRecord) => {
    setPreview({
      title: record.document_templates?.title || "Document",
      document_template_id: record.document_template_id,
      pdf_storage_path: record.pdf_storage_path,
      signed_name: record.signed_name,
      signed_at: record.signed_at,
      tier: record.tier_at_signing,
      version: record.document_version,
      ip_address: record.ip_address,
      client_full_name:
        clientNames[record.client_id] || record.signed_name || null,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No signed documents yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Signed Documents</CardTitle>
          {uniqueTiers.length > 1 && (
            <Select value={tierFilter} onValueChange={setTierFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by tier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tiers</SelectItem>
                {uniqueTiers.map((tier) => (
                  <SelectItem key={tier} value={tier}>{tier}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredRecords.map((record) => (
              <button
                key={record.id}
                onClick={() => openPreview(record)}
                className="w-full text-left flex items-center justify-between rounded-lg border border-border p-3 hover:border-primary/50 hover:bg-primary/5 transition-colors"
              >
                <div className="space-y-0.5 min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {record.document_templates?.title || "Document"}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    <span>Signed by: {record.signed_name}</span>
                    <span>•</span>
                    <span>{new Date(record.signed_at).toLocaleDateString()}</span>
                    <span>•</span>
                    <span className="text-primary">{record.tier_at_signing}</span>
                    <span>•</span>
                    <span>v{record.document_version}</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <SignedDocumentPreviewDialog
        open={!!preview}
        onOpenChange={(o) => !o && setPreview(null)}
        document={preview}
      />
    </>
  );
};

export default SignatureRecordsTable;
