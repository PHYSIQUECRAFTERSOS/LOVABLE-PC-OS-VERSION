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

  useEffect(() => {
    if (!user || !role) return;
    // Only check onboarding for clients, not coaches/admins
    if (role !== "client") {
      setOnboardingChecked(true);
      return;
    }
    // Don't check if already on onboarding page
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
        // If no record or not completed, needs onboarding
        setNeedsOnboarding(!data?.onboarding_completed);
        setOnboardingChecked(true);
      });
  }, [user, role, location.pathname]);

  if (loading || (!onboardingChecked && role === "client")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }

  if (needsOnboarding && role === "client" && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
