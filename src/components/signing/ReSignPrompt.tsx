import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import DocumentSigningFlow from "./DocumentSigningFlow";
import { Loader2 } from "lucide-react";

interface Props {
  children: React.ReactNode;
}

/**
 * Wraps authenticated client content.
 * Checks if the client has unsigned updated document versions and
 * shows a re-signing interstitial before allowing dashboard access.
 */
const ReSignPrompt = ({ children }: Props) => {
  const { user, role } = useAuth();
  const [checking, setChecking] = useState(true);
  const [needsReSigning, setNeedsReSigning] = useState(false);
  const [tierName, setTierName] = useState("Monthly");

  useEffect(() => {
    if (!user || role !== "client") {
      setChecking(false);
      return;
    }
    checkForUnsignedDocuments();
  }, [user, role]);

  const checkForUnsignedDocuments = async () => {
    if (!user) {
      setChecking(false);
      return;
    }

    const signaturesController = new AbortController();
    const templatesController = new AbortController();
    const signaturesTimeout = setTimeout(() => signaturesController.abort(), 8000);
    const templatesTimeout = setTimeout(() => templatesController.abort(), 8000);

    try {
      const { data: signatures, error: signaturesError } = await supabase
        .from("client_signatures")
        .select("tier_at_signing, document_template_id, document_version")
        .eq("client_id", user.id)
        .order("signed_at", { ascending: false })
        .abortSignal(signaturesController.signal);

      if (signaturesError) throw signaturesError;

      if (!signatures || signatures.length === 0) {
        setChecking(false);
        return;
      }

      const clientTier = signatures[0].tier_at_signing;
      setTierName(clientTier);

      const { data: templates, error: templatesError } = await supabase
        .from("document_templates")
        .select("id, version, template_key, tier_applicability")
        .eq("is_active", true)
        .abortSignal(templatesController.signal);

      if (templatesError) throw templatesError;

      if (!templates) {
        setChecking(false);
        return;
      }

      const applicable = templates.filter((t: any) => {
        if (!t.tier_applicability || t.tier_applicability.length === 0) return true;
        return t.tier_applicability.includes(clientTier);
      }).filter((t: any) => {
        if (clientTier === "Monthly") return t.template_key !== "universal_tos" && t.template_key !== "universal_tos_only";
        if (clientTier === "Transfer Client — No New Agreement Required") return t.template_key === "universal_tos_only";
        return t.template_key !== "tos_monthly" && t.template_key !== "universal_tos_only";
      });

      const signedVersions = new Map(
        signatures.map((s: any) => [s.document_template_id, s.document_version])
      );

      const unsigned = applicable.filter(
        (t: any) => signedVersions.get(t.id) !== t.version
      );

      setNeedsReSigning(unsigned.length > 0);
    } catch (err) {
      console.error("[ReSignPrompt] Check error:", err);
      setNeedsReSigning(false);
    } finally {
      clearTimeout(signaturesTimeout);
      clearTimeout(templatesTimeout);
      setChecking(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (needsReSigning) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md animate-fade-in">
          <div className="mb-6 text-center">
            <h1 className="font-display text-2xl font-bold text-foreground">
              PHYSIQUE <span className="text-gradient-gold">CRAFTERS</span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Our terms have been updated. Please review and re-sign to continue.
            </p>
          </div>
          <DocumentSigningFlow
            tierName={tierName}
            onComplete={() => setNeedsReSigning(false)}
          />
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ReSignPrompt;
