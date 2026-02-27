import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck, Clock, AlertTriangle } from "lucide-react";

type Step = "loading" | "expired" | "invalid" | "already_used" | "create_password" | "complete" | "error";

const AcceptInvite = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const token = searchParams.get("token");

  const [step, setStep] = useState<Step>("loading");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!token) { setStep("invalid"); return; }

    // Simple validate — just check the token exists and is valid
    supabase.functions.invoke("staff-invite", {
      body: { action: "accept", token, password: "________" }, // dummy to check token
    }).then(({ data }) => {
      if (data?.errorCode === "INVALID") setStep("invalid");
      else if (data?.errorCode === "ALREADY_USED") setStep("already_used");
      else if (data?.errorCode === "EXPIRED") setStep("expired");
      else if (data?.errorCode === "WEAK_PASSWORD" || data?.success === false) {
        // Token is valid but password was dummy — show password form
        setStep("create_password");
      } else if (data?.success) {
        // Shouldn't happen with dummy password but handle it
        setStep("complete");
      } else {
        setStep("create_password");
      }
    }).catch(() => setStep("invalid"));
  }, [token]);

  const handleSubmit = async () => {
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
      const { data, error } = await supabase.functions.invoke("staff-invite", {
        body: { action: "accept", token, password },
      });

      if (error || !data?.success) {
        const msg = data?.message || "Something went wrong";
        toast({ title: "Error", description: msg, variant: "destructive" });
        if (data?.errorCode) {
          setErrorMessage(msg);
          setStep("error");
        }
        return;
      }

      // Sign in
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: data.email,
        password,
      });

      if (signInErr) {
        toast({ title: "Account created! Please sign in.", description: signInErr.message });
        navigate("/auth");
        return;
      }

      setStep("complete");
      setTimeout(() => navigate("/dashboard"), 2000);
    } catch {
      toast({ title: "Something went wrong", variant: "destructive" });
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
            Staff Invitation
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
            <p className="text-sm text-muted-foreground">This invite link is not valid. Please contact your admin.</p>
          </div>
        )}

        {step === "expired" && (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <Clock className="h-12 w-12 text-primary mx-auto mb-4" />
            <h2 className="font-display text-xl font-semibold text-foreground mb-2">Invite Expired</h2>
            <p className="text-sm text-muted-foreground">This invite has expired (48h limit). Please request a new one.</p>
          </div>
        )}

        {step === "already_used" && (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <ShieldCheck className="h-12 w-12 text-primary mx-auto mb-4" />
            <h2 className="font-display text-xl font-semibold text-foreground mb-2">Already Accepted</h2>
            <p className="text-sm text-muted-foreground mb-6">This invite has already been used.</p>
            <Button onClick={() => navigate("/auth")} className="w-full">Sign In</Button>
          </div>
        )}

        {step === "create_password" && (
          <div className="rounded-lg border border-border bg-card p-8">
            <h2 className="font-display text-xl font-semibold text-foreground mb-1">Welcome to the Team</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Set up your password to join as a staff member.
            </p>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pw">Create Password</Label>
                <Input id="pw" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cpw">Confirm Password</Label>
                <Input id="cpw" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm password" />
              </div>
              <Button onClick={handleSubmit} className="w-full" disabled={loading || !password || !confirmPassword}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Join Team
              </Button>
            </div>
          </div>
        )}

        {step === "complete" && (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <ShieldCheck className="h-12 w-12 text-primary mx-auto mb-4" />
            <h2 className="font-display text-xl font-semibold text-foreground mb-2">You're In</h2>
            <p className="text-sm text-muted-foreground">Redirecting to dashboard…</p>
          </div>
        )}

        {step === "error" && (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="font-display text-xl font-semibold text-foreground mb-2">Error</h2>
            <p className="text-sm text-muted-foreground mb-4">{errorMessage}</p>
            <Button variant="outline" onClick={() => navigate("/auth")}>Back to Sign In</Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AcceptInvite;
