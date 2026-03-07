import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import DocumentViewer from "./DocumentViewer";
import ESignaturePanel from "./ESignaturePanel";

interface DocumentTemplate {
  id: string;
  template_key: string;
  document_type: string;
  title: string;
  body: string;
  version: string;
}

interface Props {
  tierName: string;
  onComplete: () => void;
}

const TRANSFER_TIER = "Transfer Client — No New Agreement Required";

const DocumentSigningFlow = ({ tierName, onComplete }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [documents, setDocuments] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [acknowledgedDocs, setAcknowledgedDocs] = useState<Set<string>>(new Set());
  const [currentDocIndex, setCurrentDocIndex] = useState(0);
  const [showSignature, setShowSignature] = useState(false);
  const [signing, setSigning] = useState(false);

  const isTransferClient = tierName === TRANSFER_TIER;

  useEffect(() => {
    loadDocuments();
  }, [tierName]);

  const loadDocuments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("document_templates")
      .select("*")
      .eq("is_active", true);

    if (error) {
      console.error("[DocumentSigningFlow] Load error:", error);
      setLoading(false);
      return;
    }

    // Filter: include documents where tier_applicability is null (universal) OR contains this tier
    const applicable = (data || []).filter((doc: any) => {
      if (!doc.tier_applicability || doc.tier_applicability.length === 0) return true;
      return doc.tier_applicability.includes(tierName);
    });

    // Tier-specific document routing
    let filtered = applicable;
    if (tierName === "Monthly") {
      // Monthly uses tos_monthly, exclude universal_tos and universal_tos_only
      filtered = applicable.filter((d: any) => 
        d.template_key !== "universal_tos" && d.template_key !== "universal_tos_only"
      );
    } else if (isTransferClient) {
      // Transfer Client uses universal_tos_only only
      filtered = applicable.filter((d: any) => 
        d.template_key === "universal_tos_only"
      );
    } else {
      // All other tiers: use universal_tos, exclude tos_monthly and universal_tos_only
      filtered = applicable.filter((d: any) => 
        d.template_key !== "tos_monthly" && d.template_key !== "universal_tos_only"
      );
    }

    // Sort: ToS first, contracts second
    filtered.sort((a: any, b: any) => {
      if (a.document_type === "universal_tos" && b.document_type !== "universal_tos") return -1;
      if (a.document_type !== "universal_tos" && b.document_type === "universal_tos") return 1;
      return 0;
    });

    setDocuments(filtered);
    setLoading(false);
  };

  const handleDocumentAcknowledged = (docId: string) => {
    const newAcknowledged = new Set(acknowledgedDocs);
    newAcknowledged.add(docId);
    setAcknowledgedDocs(newAcknowledged);

    // Move to next document or show signature panel
    if (currentDocIndex < documents.length - 1) {
      setCurrentDocIndex(currentDocIndex + 1);
    } else {
      setShowSignature(true);
    }
  };

  const handleSign = async (signedName: string) => {
    if (!user) return;
    setSigning(true);

    try {
      // Insert signature records for each document
      const signatureRecords = documents.map((doc) => ({
        client_id: user.id,
        document_template_id: doc.id,
        document_version: doc.version,
        signed_name: signedName,
        tier_at_signing: tierName,
        signed_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from("client_signatures")
        .insert(signatureRecords);

      if (error) {
        console.error("[DocumentSigningFlow] Signature insert error:", error);
        toast({ title: "Error saving signature", description: error.message, variant: "destructive" });
        setSigning(false);
        return;
      }

      toast({ title: "Agreement signed successfully ✓" });
      onComplete();
    } catch (err: any) {
      console.error("[DocumentSigningFlow] Sign error:", err);
      toast({ title: "Error", description: "Failed to save signature. Please try again.", variant: "destructive" });
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading documents…</p>
      </div>
    );
  }

  if (documents.length === 0) {
    // No documents required for this tier — skip signing
    onComplete();
    return null;
  }

  if (showSignature) {
    return (
      <ESignaturePanel
        tierName={tierName}
        documentCount={documents.length}
        onSign={handleSign}
        signing={signing}
      />
    );
  }

  const currentDoc = documents[currentDocIndex];

  return (
    <div className="space-y-4">
      {/* Progress indicator */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-muted-foreground">
          Document {currentDocIndex + 1} of {documents.length}
        </span>
        <div className="flex gap-1.5">
          {documents.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 w-6 rounded-full transition-colors ${
                i < currentDocIndex
                  ? "bg-primary"
                  : i === currentDocIndex
                    ? "bg-primary/60"
                    : "bg-muted"
              }`}
            />
          ))}
        </div>
      </div>

      <DocumentViewer
        key={currentDoc.id}
        title={currentDoc.title}
        body={currentDoc.body}
        onAcknowledge={() => handleDocumentAcknowledged(currentDoc.id)}
      />
    </div>
  );
};

export default DocumentSigningFlow;
