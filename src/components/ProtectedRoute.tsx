import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReSignPrompt from "@/components/signing/ReSignPrompt";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: ("admin" | "coach" | "client")[];
}

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, role, loading, roleLoading } = useAuth();
  const userId = user?.id;
  const location = useLocation();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [stalledLoading, setStalledLoading] = useState(false);

  // Auth is truly loading only when we have no session yet
  const isAuthLoading = loading;
  // Role is still resolving — but we have a user already
  const isRoleLoading = !!user && roleLoading && !role;

  useEffect(() => {
    if (!isAuthLoading && !isRoleLoading) {
      setStalledLoading(false);
      return;
    }

    // Give 12s before showing stall screen (up from 8s)
    const timer = setTimeout(() => {
      setStalledLoading(true);
      console.error("[ProtectedRoute] Auth hydration stalled beyond 12s");
    }, 12000);

    return () => clearTimeout(timer);
  }, [isAuthLoading, isRoleLoading]);

  useEffect(() => {
    if (!userId || !role) return;
    if (role !== "client") {
      setOnboardingChecked(true);
      return;
    }
    if (location.pathname === "/onboarding") {
      setOnboardingChecked(true);
      return;
    }

    if ((location.state as any)?.onboardingComplete) {
      setNeedsOnboarding(false);
      setOnboardingChecked(true);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    supabase
      .from("onboarding_profiles")
      .select("onboarding_completed")
      .eq("user_id", userId)
      .abortSignal(controller.signal)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[ProtectedRoute] Onboarding check failed:", error);
          setNeedsOnboarding(false);
          setOnboardingChecked(true);
          return;
        }
        setNeedsOnboarding(!data?.onboarding_completed);
        setOnboardingChecked(true);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("[ProtectedRoute] Onboarding check timed out:", error);
        setNeedsOnboarding(false);
        setOnboardingChecked(true);
      })
      .finally(() => clearTimeout(timeout));

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [userId, role, location.pathname, location.state]);

  // Still loading session (no user yet)
  if (isAuthLoading && !stalledLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Stalled — show recovery UI
  if ((isAuthLoading || isRoleLoading) && stalledLoading) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-background gap-4 px-6 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <p className="text-foreground font-medium">We couldn't finish restoring your session</p>
        <p className="text-sm text-muted-foreground">Please refresh. If this keeps happening, sign in again.</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.location.reload()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button
            variant="destructive"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/auth";
            }}
          >
            Sign in again
          </Button>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Role is still loading but hasn't stalled yet — show spinner
  if (isRoleLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!role) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-background gap-4">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <p className="text-foreground font-medium">Could not load your session role</p>
        <p className="text-sm text-muted-foreground">Please refresh. If this persists, sign in again.</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.location.reload()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button
            variant="destructive"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/auth";
            }}
          >
            Sign in again
          </Button>
        </div>
      </div>
    );
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }

  if (role === "client" && !onboardingChecked) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (needsOnboarding && role === "client" && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  // For clients, wrap content with ReSignPrompt to check for updated documents
  if (role === "client") {
    return <ReSignPrompt>{children}</ReSignPrompt>;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
