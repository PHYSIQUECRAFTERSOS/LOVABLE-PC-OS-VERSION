import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TIMEOUTS } from "@/lib/performance";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: ("admin" | "coach" | "client")[];
}

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, role, loading } = useAuth();
  const location = useLocation();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  // Hard timeout — 3 seconds max per performance standards
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

  // Still loading but within timeout
  if (loading && !timedOut) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Timed out while loading — if no user, redirect to auth
  if (timedOut && loading && !user) {
    return <Navigate to="/auth" replace />;
  }

  // Timed out but we have a user — let them through (best-effort)
  if (timedOut && loading && user) {
    console.warn("[ProtectedRoute] Timed out but user exists, allowing access");
    return <>{children}</>;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Role check
  if (allowedRoles && role && !allowedRoles.includes(role)) {
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
