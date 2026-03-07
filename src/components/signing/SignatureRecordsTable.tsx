import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Download, FileText } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SignatureRecord {
  id: string;
  client_id: string;
  document_version: string;
  signed_name: string;
  signed_at: string;
  tier_at_signing: string;
  pdf_storage_path: string | null;
  document_templates: {
    title: string;
    template_key: string;
  };
  profiles?: {
    full_name: string;
  };
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
  const [loading, setLoading] = useState(true);
  const [tierFilter, setTierFilter] = useState<string>("all");

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

    setRecords((data as any[]) || []);
    setLoading(false);
  };

  const handleDownloadPdf = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("signature-records")
      .createSignedUrl(path, 3600);

    if (error || !data?.signedUrl) {
      console.error("[SignatureRecords] Download error:", error);
      return;
    }

    window.open(data.signedUrl, "_blank");
  };

  const filteredRecords = tierFilter === "all"
    ? records
    : records.filter((r) => r.tier_at_signing === tierFilter);

  const uniqueTiers = [...new Set(records.map((r) => r.tier_at_signing))];

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
            <div
              key={record.id}
              className="flex items-center justify-between rounded-lg border border-border p-3"
            >
              <div className="space-y-0.5 min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  {(record.document_templates as any)?.title || "Document"}
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
              {record.pdf_storage_path && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDownloadPdf(record.pdf_storage_path!)}
                >
                  <Download className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default SignatureRecordsTable;
