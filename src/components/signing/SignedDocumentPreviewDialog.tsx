import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  renderDocumentBody,
  SignatureFooter,
  generateDocumentPdf,
  buildPdfFilename,
  WAIVER_BODY,
  type SignatureFooterData,
} from "@/lib/legalDocuments";

export interface PreviewDocument {
  /** Display title (e.g. "Physique Crafters Terms of Service") */
  title: string;
  /** Optional template id — used to fetch body when not provided */
  document_template_id?: string | null;
  /** Optional preloaded body (skips template fetch) */
  body?: string | null;
  /** Stored PDF path in `signature-records` bucket. If present, displayed in an iframe. */
  pdf_storage_path?: string | null;
  /** Signature meta for footer + PDF generation */
  signed_name?: string | null;
  signed_at?: string | null;
  tier?: string | null;
  version?: string | null;
  ip_address?: string | null;
  client_full_name?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: PreviewDocument | null;
}

const SignedDocumentPreviewDialog = ({ open, onOpenChange, document: doc }: Props) => {
  const [loading, setLoading] = useState(false);
  const [body, setBody] = useState<string>("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !doc) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setPdfUrl(null);
      setBody("");

      // 1. Resolve stored PDF if available
      if (doc.pdf_storage_path) {
        const { data, error } = await supabase.storage
          .from("signature-records")
          .createSignedUrl(doc.pdf_storage_path, 3600);
        if (!cancelled && !error && data?.signedUrl) {
          setPdfUrl(data.signedUrl);
        }
      }

      // 2. Resolve body for HTML preview / on-the-fly PDF
      let resolvedBody = doc.body || "";
      if (!resolvedBody && doc.document_template_id) {
        const { data, error } = await supabase
          .from("document_templates")
          .select("body")
          .eq("id", doc.document_template_id)
          .maybeSingle();
        if (!error && data?.body) resolvedBody = data.body;
      }
      if (!resolvedBody) resolvedBody = WAIVER_BODY;

      if (!cancelled) {
        setBody(resolvedBody);
        setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [open, doc]);

  if (!doc) return null;

  const footerData: SignatureFooterData = {
    signed_name: doc.signed_name ?? null,
    signed_at: doc.signed_at ?? null,
    tier: doc.tier ?? null,
    version: doc.version ?? null,
    ip_address: doc.ip_address ?? null,
    client_full_name: doc.client_full_name ?? null,
  };

  const handleDownload = async () => {
    try {
      if (pdfUrl) {
        const a = window.document.createElement("a");
        a.href = pdfUrl;
        a.download = buildPdfFilename(doc.title, doc.client_full_name ?? null, doc.signed_at ?? null);
        a.target = "_blank";
        a.rel = "noopener";
        window.document.body.appendChild(a);
        a.click();
        window.document.body.removeChild(a);
        return;
      }
      generateDocumentPdf({
        title: doc.title,
        body,
        footer: footerData,
        filename: buildPdfFilename(doc.title, doc.client_full_name ?? null, doc.signed_at ?? null),
      });
    } catch (err) {
      console.error("[SignedDocumentPreview] download error", err);
      toast.error("Could not download document");
    }
  };

  const handlePrint = () => {
    try {
      if (pdfUrl) {
        // Open stored PDF in a new tab — browser print dialog from there
        window.open(pdfUrl, "_blank", "noopener");
        return;
      }
      window.print();
    } catch (err) {
      console.error("[SignedDocumentPreview] print error", err);
      toast.error("Could not open print dialog");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0 flex-1">
              <DialogTitle className="text-base text-primary">{doc.title}</DialogTitle>
              <div className="flex items-center gap-2 flex-wrap">
                {doc.tier && (
                  <Badge variant="secondary" className="text-[10px]">{doc.tier}</Badge>
                )}
                {doc.version && (
                  <span className="text-[11px] text-muted-foreground">v{doc.version}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
                <Printer className="h-3.5 w-3.5" />
                Print
              </Button>
              <Button size="sm" onClick={handleDownload} className="gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Download
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : pdfUrl ? (
            <iframe
              src={pdfUrl}
              title={doc.title}
              className="w-full h-[70vh] bg-background"
            />
          ) : (
            <div id="signed-doc-print-area" className="px-6 py-5">
              {renderDocumentBody(body)}
              <SignatureFooter data={footerData} />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SignedDocumentPreviewDialog;
