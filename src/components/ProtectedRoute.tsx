import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

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

  // Hard timeout — never show spinner longer than 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 5000);
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

    supabase
      .from("onboarding_profiles")
      .select("onboarding_completed")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
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

  // Timed out while loading — if we have a user, proceed with best-effort role
  if (timedOut && loading && !user) {
    return <Navigate to="/auth" replace />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // If role check is needed but role hasn't resolved yet, allow access rather than blocking
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
