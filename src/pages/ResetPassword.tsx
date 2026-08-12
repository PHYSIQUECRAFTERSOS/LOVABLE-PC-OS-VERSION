import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { clearLocalAuthState } from "@/lib/authRecovery";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [expired, setExpired] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const settledRef = useRef(false);
  // A token_hash is only redeemed when the user submits the form, so mail
  // scanners that pre-open the link can never burn the one-time token.
  const pendingTokenRef = useRef<{ token_hash: string; type: string } | null>(null);

  const minLength = password.length >= 8;
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  useEffect(() => {
    let cancelled = false;

    const markReady = () => {
      if (cancelled || settledRef.current) return;
      settledRef.current = true;
      setExpired(false);
      setReady(true);
    };

    const markExpired = () => {
      if (cancelled || settledRef.current) return;
      settledRef.current = true;
      setReady(false);
      setExpired(true);
    };

    // A genuine recovery event always wins.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) markReady();
    });

    const establishRecoverySession = async () => {
      const url = new URL(window.location.href);
      const query = url.searchParams;
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));

      const tokenHash = query.get("token_hash") ?? query.get("token");
      const type = query.get("type") ?? hash.get("type");
      const code = query.get("code");
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const errorDescription = query.get("error_description") ?? hash.get("error_description");

      if (errorDescription) {
        markExpired();
        return;
      }

      const hasCredential = Boolean(tokenHash || code || (accessToken && refreshToken));

      // No recovery credential in the link — a leftover stale session must never
      // make this page look usable.
      if (!hasCredential) {
        markExpired();
        return;
      }

      // Drop any stale/expired token before exchanging the recovery credential.
      clearLocalAuthState();

      try {
        if (tokenHash) {
          // Defer redemption to submit time (scanner-safe).
          pendingTokenRef.current = { token_hash: tokenHash, type: type || "recovery" };
        } else if (accessToken && refreshToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error || !data.session) throw error ?? new Error("No session");
        } else if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error || !data.session) throw error ?? new Error("No session");
        }

        // Clean the credential out of the URL so a refresh can't re-use it.
        window.history.replaceState({}, "", `${url.origin}${url.pathname}`);
        markReady();
      } catch (err) {
        console.error("[reset-password] recovery exchange failed:", err);
        markExpired();
      }
    };

    establishRecoverySession();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!minLength || !passwordsMatch) return;

    setLoading(true);
    try {
      const pending = pendingTokenRef.current;
      if (pending) {
        const { data, error: otpError } = await supabase.auth.verifyOtp({
          type: (pending.type as "recovery") || "recovery",
          token_hash: pending.token_hash,
        });
        if (otpError || !data.session) throw otpError ?? new Error("Auth session missing!");
        pendingTokenRef.current = null;
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;


      toast({
        title: "Password successfully updated",
        description: "Please sign in with your new password.",
      });

      await supabase.auth.signOut();
      navigate("/auth");
    } catch (error: any) {
      const message: string = error?.message || "";
      const sessionIssue = /session/i.test(message);

      toast({
        title: sessionIssue ? "Reset link no longer valid" : "Error",
        description: sessionIssue
          ? "Open the reset link again from your email in the same browser, or request a new link."
          : message,
        variant: "destructive",
      });

      if (sessionIssue) {
        settledRef.current = true;
        setReady(false);
        setExpired(true);
      }
    } finally {
      setLoading(false);
    }
  };

  if (expired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md animate-fade-in">
          <div className="rounded-lg border border-border bg-card p-8 text-center space-y-4">
            <XCircle className="mx-auto h-12 w-12 text-destructive" />
            <h2 className="font-display text-xl font-semibold text-foreground">
              Reset Link Expired
            </h2>
            <p className="text-sm text-muted-foreground">
              This reset link has expired, was already used, or was opened in a different browser.
              Request a new one and open it in your normal browser.
            </p>
            <Button variant="outline" onClick={() => navigate("/forgot-password")} className="mt-2">
              Request New Link
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-10 text-center">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
            PHYSIQUE <span className="text-gradient-gold">CRAFTERS</span>
          </h1>
        </div>

        <div className="rounded-lg border border-border bg-card p-8">
          <h2 className="mb-2 font-display text-xl font-semibold text-foreground">
            Create New Password
          </h2>
          <p className="mb-6 text-xs text-muted-foreground">
            Enter your new password below.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
              />
              <div className="flex items-center gap-1.5 text-xs">
                {minLength ? (
                  <CheckCircle className="h-3.5 w-3.5 text-success" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className={minLength ? "text-success" : "text-muted-foreground"}>
                  At least 8 characters
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              {confirmPassword.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs">
                  {passwordsMatch ? (
                    <CheckCircle className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-destructive" />
                  )}
                  <span className={passwordsMatch ? "text-success" : "text-destructive"}>
                    {passwordsMatch ? "Passwords match" : "Passwords do not match"}
                  </span>
                </div>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loading || !minLength || !passwordsMatch}
            >
              {loading && <Loader2 className="animate-spin" />}
              Reset Password
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
