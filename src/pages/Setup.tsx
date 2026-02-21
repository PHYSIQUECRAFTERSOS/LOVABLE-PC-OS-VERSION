import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ShieldCheck, Clock, AlertTriangle } from "lucide-react";
import LegalDocumentModal from "@/components/legal/LegalDocumentModal";

type SetupStep = "loading" | "expired" | "invalid" | "already_used" | "create_password" | "complete" | "error";

interface InviteInfo {
  first_name: string;
  last_name: string;
  email: string;
  coach_name: string;
}

interface LegalDoc {
  id: string;
  document_type: string;
  title: string;
  content: string;
  version_number: number;
}

const ClientSetup = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const token = searchParams.get("token");

  const [step, setStep] = useState<SetupStep>("loading");
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Legal documents
  const [legalDocs, setLegalDocs] = useState<LegalDoc[]>([]);
  const [activeModal, setActiveModal] = useState<"terms_of_service" | "privacy_policy" | null>(null);

  useEffect(() => {
    if (!token) {
      setStep("invalid");
      return;
    }
    validateToken();
    fetchLegalDocs();
  }, [token]);

  const fetchLegalDocs = async () => {
    const { data } = await supabase
      .from("legal_documents")
      .select("id, document_type, title, content, version_number")
      .eq("is_current", true);
    if (data) setLegalDocs(data);
  };

  const getDoc = (type: string) => legalDocs.find((d) => d.document_type === type);

  const callEdgeFunction = async (payload: Record<string, unknown>) => {
    console.log("[Setup] Calling validate-invite-token with:", { ...payload, password: payload.password ? "***" : undefined });

    const { data, error } = await supabase.functions.invoke("validate-invite-token", {
      body: payload,
    });

    if (error) {
      console.error("[Setup] Edge function error:", error);
      let parsed: Record<string, unknown> | null = null;
      try {
        if (error && typeof error === "object" && "context" in error) {
          const ctx = (error as any).context;
          if (ctx && typeof ctx.json === "function") {
            parsed = await ctx.json();
          }
        }
      } catch {
        // ignore parse failure
      }

      if (parsed) {
        console.log("[Setup] Parsed error response:", parsed);
        return parsed;
      }

      return { success: false, message: "Unable to reach the server. Please try again.", errorCode: "NETWORK_ERROR" };
    }

    console.log("[Setup] Response:", data);
    return data;
  };

  const validateToken = async () => {
    try {
      const result = await callEdgeFunction({ token, action: "validate" });

      if (result?.success && result?.valid) {
        setInviteInfo(result.invite as InviteInfo);
        setStep("create_password");
      } else {
        const code = result?.errorCode;
        if (code === "EXPIRED") setStep("expired");
        else if (code === "ALREADY_USED") setStep("already_used");
        else if (code === "INVALID_TOKEN" || code === "INVALIDATED") setStep("invalid");
        else {
          setErrorMessage(result?.message || "Something went wrong.");
          setStep("error");
        }
      }
    } catch {
      setStep("invalid");
    }
  };

  const handleCreateAccount = async () => {
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (password.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }

    console.log("[Setup] Confirm Account clicked");
    setLoading(true);

    try {
      // Collect legal document acceptance info
      const termsDoc = getDoc("terms_of_service");
      const privacyDoc = getDoc("privacy_policy");
      const legalAcceptances = [
        termsDoc && { document_id: termsDoc.id, document_type: "terms_of_service", document_version: termsDoc.version_number },
        privacyDoc && { document_id: privacyDoc.id, document_type: "privacy_policy", document_version: privacyDoc.version_number },
      ].filter(Boolean);

      const result = await callEdgeFunction({
        token,
        password,
        action: "setup",
        legal_acceptances: legalAcceptances,
      });

      if (result?.success) {
        console.log("[Setup] Account created, signing in as:", result.email);
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: result.email as string,
          password,
        });

        if (signInError) {
          console.error("[Setup] Sign-in error:", signInError.message);
          toast({ title: "Account created! Please sign in.", description: signInError.message });
          navigate("/auth");
          return;
        }

        setStep("complete");
        setTimeout(() => navigate("/onboarding"), 2000);
      } else {
        const msg = result?.message || "Something went wrong.";
        console.error("[Setup] Setup failed:", result?.errorCode, msg);
        toast({ title: "Error", description: msg, variant: "destructive" });
      }
    } catch (err: any) {
      console.error("[Setup] Unexpected error:", err);
      toast({
        title: "Something went wrong",
        description: "We're having trouble confirming your account. Please try again or contact support.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const termsDoc = getDoc("terms_of_service");
  const privacyDoc = getDoc("privacy_policy");
  const activeDoc = activeModal ? getDoc(activeModal) : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-10 text-center">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
            PHYSIQUE <span className="text-gradient-gold">CRAFTERS</span>
          </h1>
          <p className="mt-2 text-sm tracking-[0.2em] uppercase text-muted-foreground">
            The Triple O Method
          </p>
        </div>

        {step === "loading" && (
          <div className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Validating your invite…</p>
          </div>
        )}

        {step === "invalid" && (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="font-display text-xl font-semibold text-foreground mb-2">Invalid Invite Link</h2>
            <p className="text-sm text-muted-foreground mb-6">
              This invite link is not valid. Please contact your coach to receive a new access link.
            </p>
            <p className="text-xs text-muted-foreground">Access is by invitation only.</p>
          </div>
        )}

        {step === "expired" && (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <Clock className="h-12 w-12 text-primary mx-auto mb-4" />
            <h2 className="font-display text-xl font-semibold text-foreground mb-2">Invite Expired</h2>
            <p className="text-sm text-muted-foreground mb-6">
              This invite link has expired. Please contact your coach to receive a new access link.
            </p>
            <p className="text-xs text-muted-foreground">Invite links are valid for 7 days.</p>
          </div>
        )}

        {step === "already_used" && (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <ShieldCheck className="h-12 w-12 text-primary mx-auto mb-4" />
            <h2 className="font-display text-xl font-semibold text-foreground mb-2">Already Set Up</h2>
            <p className="text-sm text-muted-foreground mb-6">
              This invite has already been used. You can sign in with your credentials.
            </p>
            <Button onClick={() => navigate("/auth")} className="w-full">Sign In</Button>
          </div>
        )}

        {step === "create_password" && inviteInfo && (
          <div className="rounded-lg border border-border bg-card p-8">
            <h2 className="font-display text-xl font-semibold text-foreground mb-1">
              Welcome, {inviteInfo.first_name}
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              {inviteInfo.coach_name} has invited you to join Physique Crafters. Set up your account to get started.
            </p>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="setup_password">Create Password</Label>
                <Input
                  id="setup_password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  minLength={8}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm_password">Confirm Password</Label>
                <Input
                  id="confirm_password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  required
                />
              </div>

              <div className="space-y-3 pt-2">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="terms"
                    checked={termsAccepted}
                    disabled={true}
                    onCheckedChange={() => {}}
                  />
                  <Label htmlFor="terms" className="text-xs text-muted-foreground leading-tight">
                    I agree to the{" "}
                    <button
                      type="button"
                      onClick={() => setActiveModal("terms_of_service")}
                      className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors font-medium"
                    >
                      Terms of Service
                    </button>{" "}
                    and understand the coaching program requirements.
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="privacy"
                    checked={privacyAccepted}
                    disabled={true}
                    onCheckedChange={() => {}}
                  />
                  <Label htmlFor="privacy" className="text-xs text-muted-foreground leading-tight">
                    I agree to the{" "}
                    <button
                      type="button"
                      onClick={() => setActiveModal("privacy_policy")}
                      className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors font-medium"
                    >
                      Privacy Policy
                    </button>{" "}
                    and consent to the collection of health data.
                  </Label>
                </div>
              </div>

              <Button
                onClick={handleCreateAccount}
                className="w-full"
                disabled={loading || !termsAccepted || !privacyAccepted || !password || !confirmPassword}
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm Account
              </Button>
            </div>
          </div>
        )}

        {step === "complete" && (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <ShieldCheck className="h-12 w-12 text-primary mx-auto mb-4" />
            <h2 className="font-display text-xl font-semibold text-foreground mb-2">Account Created</h2>
            <p className="text-sm text-muted-foreground">Redirecting you to your dashboard…</p>
          </div>
        )}

        {step === "error" && (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="font-display text-xl font-semibold text-foreground mb-2">Something Went Wrong</h2>
            <p className="text-sm text-muted-foreground mb-4">{errorMessage || "An unexpected error occurred."}</p>
            <Button variant="outline" onClick={() => navigate("/auth")}>Back to Sign In</Button>
          </div>
        )}
      </div>

      {/* Legal Document Modal */}
      <LegalDocumentModal
        open={!!activeModal && !!activeDoc}
        onClose={() => setActiveModal(null)}
        onAccept={() => {
          if (activeModal === "terms_of_service") setTermsAccepted(true);
          if (activeModal === "privacy_policy") setPrivacyAccepted(true);
          setActiveModal(null);
        }}
        title={activeDoc?.title || ""}
        content={activeDoc?.content || ""}
      />
    </div>
  );
};

export default ClientSetup;
