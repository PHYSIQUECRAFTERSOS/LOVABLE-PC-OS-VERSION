import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TIMEOUTS } from "@/lib/performance";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: ("admin" | "coach" | "client")[];
}

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, role, loading, roleLoading } = useAuth();
  const location = useLocation();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  // Hard timeout — 3 seconds max
  useEffect(() => {
    const timer = setTimeout(() => {
      console.error("[ProtectedRoute] Auth loading timed out after 3s");
      setTimedOut(true);
    }, TIMEOUTS.SPINNER_MAX);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!user || !role) return;
    if (role !== "client") {
      setOnboardingChecked(true);
      return;
    }
    if (location.pathname === "/onboarding") {
      setOnboardingChecked(true);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUTS.SPINNER_MAX);

    supabase
      .from("onboarding_profiles")
      .select("onboarding_completed")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        clearTimeout(timeout);
        if (error) {
          console.error("[ProtectedRoute] Onboarding check failed:", error);
        }
        setNeedsOnboarding(!data?.onboarding_completed);
        setOnboardingChecked(true);
      });
  }, [user, role, location.pathname]);

  const isAuthLoading = loading || (!!user && roleLoading);

  // Still loading but within timeout
  if (isAuthLoading && !timedOut) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Timed out while loading — if no user, redirect to auth
  if (timedOut && !user) {
    return <Navigate to="/auth" replace />;
  }

  // Timed out but we have a user and no role — show error, don't render blank
  if (timedOut && user && !role) {
    console.error("[ProtectedRoute] Timed out with user but no role resolved");
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-4">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <p className="text-foreground font-medium">Session error</p>
        <p className="text-sm text-muted-foreground">Could not determine your account role.</p>
        <Button
          variant="outline"
          onClick={() => window.location.reload()}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Wait for role before rendering anything
  if (!role) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  console.log("[ProtectedRoute] Rendering:", { role, path: location.pathname, allowedRoles });

  // Role check
  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }

  // Onboarding check for clients
  if (role === "client" && !onboardingChecked && !timedOut) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (needsOnboarding && role === "client" && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
