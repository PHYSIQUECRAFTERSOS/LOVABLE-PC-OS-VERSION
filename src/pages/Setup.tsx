import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ShieldCheck, Clock, AlertTriangle } from "lucide-react";

type SetupStep = "loading" | "expired" | "invalid" | "already_used" | "create_password" | "accept_terms" | "complete" | "error";

interface InviteInfo {
  first_name: string;
  last_name: string;
  email: string;
  coach_name: string;
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

  useEffect(() => {
    if (!token) {
      setStep("invalid");
      return;
    }
    validateToken();
  }, [token]);

  const validateToken = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("validate-invite-token", {
        body: { token, action: "validate" },
      });

      if (error) {
        const parsed = typeof error === "object" && "message" in error ? error.message : String(error);
        if (parsed.includes("EXPIRED")) {
          setStep("expired");
        } else if (parsed.includes("ALREADY_USED")) {
          setStep("already_used");
        } else {
          setStep("invalid");
        }
        return;
      }

      if (data?.valid) {
        setInviteInfo(data.invite);
        setStep("create_password");
      } else if (data?.error) {
        if (data.code === "EXPIRED") setStep("expired");
        else if (data.code === "ALREADY_USED") setStep("already_used");
        else {
          setErrorMessage(data.error);
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

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("validate-invite-token", {
        body: { token, password, action: "setup" },
      });

      if (error) {
        throw new Error(typeof error === "object" && "message" in error ? error.message : String(error));
      }

      if (data?.success) {
        // Sign the user in
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: data.email,
          password,
        });

        if (signInError) {
          toast({ title: "Account created! Please sign in.", description: signInError.message });
          navigate("/auth");
          return;
        }

        setStep("complete");
        setTimeout(() => navigate("/dashboard"), 2000);
      } else if (data?.error) {
        throw new Error(data.error);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

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
            <h2 className="font-display text-xl font-semibold text-foreground mb-2">
              Invalid Invite Link
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              This invite link is not valid. Please contact your coach to receive a new access link.
            </p>
            <p className="text-xs text-muted-foreground">
              Access is by invitation only.
            </p>
          </div>
        )}

        {step === "expired" && (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <Clock className="h-12 w-12 text-primary mx-auto mb-4" />
            <h2 className="font-display text-xl font-semibold text-foreground mb-2">
              Invite Expired
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              This invite link has expired. Please contact your coach to receive a new access link.
            </p>
            <p className="text-xs text-muted-foreground">
              Invite links are valid for 7 days.
            </p>
          </div>
        )}

        {step === "already_used" && (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <ShieldCheck className="h-12 w-12 text-primary mx-auto mb-4" />
            <h2 className="font-display text-xl font-semibold text-foreground mb-2">
              Already Set Up
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              This invite has already been used. You can sign in with your credentials.
            </p>
            <Button onClick={() => navigate("/auth")} className="w-full">
              Sign In
            </Button>
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
                    onCheckedChange={(v) => setTermsAccepted(v as boolean)}
                  />
                  <Label htmlFor="terms" className="text-xs text-muted-foreground leading-tight cursor-pointer">
                    I agree to the Terms of Service and understand the coaching program requirements.
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="privacy"
                    checked={privacyAccepted}
                    onCheckedChange={(v) => setPrivacyAccepted(v as boolean)}
                  />
                  <Label htmlFor="privacy" className="text-xs text-muted-foreground leading-tight cursor-pointer">
                    I agree to the Privacy Policy and consent to the collection of health data.
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
            <h2 className="font-display text-xl font-semibold text-foreground mb-2">
              Account Created
            </h2>
            <p className="text-sm text-muted-foreground">
              Redirecting you to your dashboard…
            </p>
          </div>
        )}

        {step === "error" && (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="font-display text-xl font-semibold text-foreground mb-2">
              Something Went Wrong
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              {errorMessage || "An unexpected error occurred."}
            </p>
            <Button variant="outline" onClick={() => navigate("/auth")}>
              Back to Sign In
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientSetup;
