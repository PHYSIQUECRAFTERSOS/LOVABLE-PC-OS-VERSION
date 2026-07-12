import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AUTH_RESTORE_TIMEOUT_MS, resetAuthAndRedirect } from "@/lib/authRecovery";

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (!loading) {
      navigate(user ? "/dashboard" : "/auth", { replace: true });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!loading) {
      setStalled(false);
      return;
    }

    const timer = setTimeout(() => setStalled(true), AUTH_RESTORE_TIMEOUT_MS + 2000);
    return () => clearTimeout(timer);
  }, [loading]);

  if (stalled) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-background gap-4 px-6 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <p className="text-foreground font-medium">We couldn't finish restoring your session</p>
        <p className="text-sm text-muted-foreground">Reset the saved login, then sign in again.</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.location.reload()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button variant="destructive" onClick={() => resetAuthAndRedirect("/auth?authReset=1")}>
            Sign in again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
};

export default Index;
