import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck, Clock, AlertTriangle, Smartphone } from "lucide-react";
import DocumentSigningFlow from "@/components/signing/DocumentSigningFlow";
import { TIMEOUTS } from "@/lib/performance";

type SetupStep = "loading" | "expired" | "invalid" | "already_used" | "create_password" | "signing" | "download_app" | "complete" | "error";

const APP_STORE_URL = "https://apps.apple.com/ca/app/physique-crafters/id6760598660";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.physiquecrafters.app.twa";

interface InviteInfo {
  first_name: string;
  last_name: string;
  email: string;
  coach_name: string;
  tier_name: string;
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
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const isIOS = useMemo(() => /iPhone|iPad|iPod/i.test(navigator.userAgent), []);
  const isAndroid = useMemo(() => /Android/i.test(navigator.userAgent), []);

  useEffect(() => {
    if (step !== "loading") return;
    const timeout = setTimeout(() => {
      setErrorMessage("Validation is taking too long. Please try again.");
      setStep("error");
    }, TIMEOUTS.SPINNER_MAX);
    return () => clearTimeout(timeout);
  }, [step]);

  useEffect(() => {
    if (!token) { setStep("invalid"); return; }
    validateToken();
  }, [token]);

  const callEdgeFunction = async (payload: Record<string, unknown>) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUTS.STANDARD_API);
    try {
      const { data, error } = await supabase.functions.invoke("validate-invite-token", { body: payload });
      clearTimeout(timeout);
      if (error) {
        let parsed: Record<string, unknown> | null = null;
        try {
          if (error && typeof error === "object" && "context" in error) {
            const ctx = (error as any).context;
            if (ctx && typeof ctx.json === "function") parsed = await ctx.json();
          }
        } catch {}
        if (parsed) return parsed;
        return { success: false, message: "Unable to reach the server.", errorCode: "NETWORK_ERROR" };
      }
      return data;
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === "AbortError") return { success: false, message: "Request timed out.", errorCode: "TIMEOUT" };
      throw err;
    }
  };

  const validateToken = async () => {
    try {
      const result = await callEdgeFunction({ token, action: "validate" });
      if (result?.success && result?.valid) {
        const invite = result.invite as any;
        setInviteInfo({
          first_name: invite.first_name,
          last_name: invite.last_name,
          email: invite.email,
          coach_name: invite.coach_name || "Your Coach",
          tier_name: invite.tier_name || "Monthly",
        });
        setStep("create_password");
      } else {
        const code = result?.errorCode;
        if (code === "EXPIRED") setStep("expired");
        else if (code === "ALREADY_USED") setStep("already_used");
        else if (code === "INVALID_TOKEN" || code === "INVALIDATED") setStep("invalid");
        else { setErrorMessage(result?.message || "Something went wrong."); setStep("error"); }
      }
    } catch { setStep("invalid"); }
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
    const hardTimeout = setTimeout(() => {
      setLoading(false);
      setErrorMessage("Account creation is taking too long.");
      setStep("error");
    }, TIMEOUTS.STANDARD_API);

    try {
      const result = await callEdgeFunction({ token, password, action: "setup" });
      clearTimeout(hardTimeout);

      if (result?.success) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: result.email as string,
          password,
        });

        if (signInError) {
          toast({ title: "Account created! Please sign in.", description: signInError.message });
          navigate("/auth");
          return;
        }

        setStep("signing");
      } else {
        const msg = result?.message || "Something went wrong.";
        toast({ title: "Error", description: msg, variant: "destructive" });
      }
    } catch (err: any) {
      clearTimeout(hardTimeout);
      toast({ title: "Something went wrong", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSigningComplete = () => {
    setStep("download_app");
  };

  const handleContinueToOnboarding = () => {
    setStep("complete");
    const startTime = Date.now();
    const checkSession = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session || Date.now() - startTime >= TIMEOUTS.SPINNER_MAX) {
        navigate("/onboarding", { replace: true });
        return;
      }
      setTimeout(checkSession, 300);
    };
    checkSession();
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
            <h2 className="font-display text-xl font-semibold text-foreground mb-2">Invalid Invite Link</h2>
            <p className="text-sm text-muted-foreground mb-6">
              This invite link is not valid. Please contact your coach to receive a new access link.
            </p>
          </div>
        )}

        {step === "expired" && (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <Clock className="h-12 w-12 text-primary mx-auto mb-4" />
            <h2 className="font-display text-xl font-semibold text-foreground mb-2">Invite Expired</h2>
            <p className="text-sm text-muted-foreground mb-6">
              This invite link has expired. Please contact your coach to receive a new access link.
            </p>
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
                <Input id="setup_password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" minLength={8} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm_password">Confirm Password</Label>
                <Input id="confirm_password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm password" required />
              </div>

              <Button onClick={handleCreateAccount} className="w-full" disabled={loading || !password || !confirmPassword}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Continue
              </Button>
            </div>
          </div>
        )}

        {step === "signing" && inviteInfo && (
          <DocumentSigningFlow
            tierName={inviteInfo.tier_name}
            onComplete={handleSigningComplete}
          />
        )}

        {step === "download_app" && (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <Smartphone className="h-12 w-12 text-primary mx-auto mb-4" />
            <h2 className="font-display text-xl font-semibold text-foreground mb-2">
              Download the App
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              For the best experience, download Physique Crafters on your device.
            </p>

            <div className="space-y-3 mb-6">
              {/* Show platform-relevant store first */}
              {isIOS ? (
                <>
                  <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="block">
                    <Button variant="outline" className="w-full h-14 text-base font-semibold gap-3 border-primary/30 hover:border-primary">
                      🍎 Download on App Store
                    </Button>
                  </a>
                  <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="block">
                    <Button variant="ghost" className="w-full h-12 text-sm text-muted-foreground gap-2">
                      ▶️ Get it on Google Play
                    </Button>
                  </a>
                </>
              ) : isAndroid ? (
                <>
                  <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="block">
                    <Button variant="outline" className="w-full h-14 text-base font-semibold gap-3 border-primary/30 hover:border-primary">
                      ▶️ Get it on Google Play
                    </Button>
                  </a>
                  <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="block">
                    <Button variant="ghost" className="w-full h-12 text-sm text-muted-foreground gap-2">
                      🍎 Download on App Store
                    </Button>
                  </a>
                </>
              ) : (
                <>
                  <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="block">
                    <Button variant="outline" className="w-full h-14 text-base font-semibold gap-3 border-primary/30 hover:border-primary">
                      🍎 Download on App Store
                    </Button>
                  </a>
                  <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="block">
                    <Button variant="outline" className="w-full h-14 text-base font-semibold gap-3 border-primary/30 hover:border-primary">
                      ▶️ Get it on Google Play
                    </Button>
                  </a>
                </>
              )}
            </div>

            <div className="border-t border-border pt-4">
              <Button onClick={handleContinueToOnboarding} className="w-full">
                Continue Setup →
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Already have the app? Tap continue to finish your profile setup.
              </p>
            </div>
          </div>
        )}

        {step === "complete" && (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <ShieldCheck className="h-12 w-12 text-primary mx-auto mb-4" />
            <h2 className="font-display text-xl font-semibold text-foreground mb-2">All Set!</h2>
            <p className="text-sm text-muted-foreground">Redirecting to your profile setup…</p>
            <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto mt-4" />
          </div>
        )}

        {step === "error" && (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="font-display text-xl font-semibold text-foreground mb-2">Something Went Wrong</h2>
            <p className="text-sm text-muted-foreground mb-4">{errorMessage || "An unexpected error occurred."}</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate("/auth")} className="flex-1">Sign In</Button>
              <Button onClick={() => window.location.reload()} className="flex-1">Retry</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientSetup;
