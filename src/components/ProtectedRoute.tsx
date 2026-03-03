import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hard timeout — 5 seconds max (generous to avoid false redirects)
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      console.error("[ProtectedRoute] Auth loading timed out after 5s");
      setTimedOut(true);
    }, 5000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Clear timeout as soon as auth resolves
  const isAuthLoading = loading || (!!user && roleLoading);
  useEffect(() => {
    if (!isAuthLoading && timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [isAuthLoading]);

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

    supabase
      .from("onboarding_profiles")
      .select("onboarding_completed")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error("[ProtectedRoute] Onboarding check failed:", error);
        }
        setNeedsOnboarding(!data?.onboarding_completed);
        setOnboardingChecked(true);
      });
  }, [user, role, location.pathname]);

  // Still loading and within timeout
  if (isAuthLoading && !timedOut) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Timed out while loading — if no user at all, redirect to auth
  if (timedOut && !user) {
    console.error("[ProtectedRoute] Timed out with no user, redirecting to /auth");
    return <Navigate to="/auth" replace />;
  }

  // Timed out but we have a user and no role — show error
  if (timedOut && user && !role) {
    console.error("[ProtectedRoute] Timed out with user but no role");
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

  // Auth fully resolved, no user
  if (!isAuthLoading && !user) {
    return <Navigate to="/auth" replace />;
  }

  // Still no role (shouldn't happen if not loading, but safety)
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
