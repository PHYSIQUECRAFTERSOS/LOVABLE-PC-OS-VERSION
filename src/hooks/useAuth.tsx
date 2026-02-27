import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

type AppRole = "admin" | "coach" | "client";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const autoAcceptAttempted = useRef(false);

  const fetchRoles = useCallback(async (userId: string): Promise<AppRole[]> => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const fetched = (data || []).map((r) => r.role as AppRole);
    return fetched.length > 0 ? fetched : [];
  }, []);

  /**
   * Safety net: If a user is authenticated but has no roles or no coach_clients,
   * call the auto-accept endpoint to bind any pending invite.
   */
  const tryAutoAcceptInvite = useCallback(async (currentSession: Session) => {
    if (autoAcceptAttempted.current) return;
    autoAcceptAttempted.current = true;

    try {
      console.log("[useAuth] Attempting auto-accept for pending invites...");
      const { data, error } = await supabase.functions.invoke("validate-invite-token", {
        body: { action: "auto-accept" },
      });

      if (error) {
        console.error("[useAuth] Auto-accept error:", error);
        return;
      }

      if (data?.success && data?.accepted) {
        console.log("[useAuth] Auto-accept succeeded, refreshing roles...");
        // Re-fetch roles after auto-accept
        const newRoles = await fetchRoles(currentSession.user.id);
        if (newRoles.length > 0) {
          setRoles(newRoles);
        } else {
          // Trigger created role via DB trigger, wait briefly and retry
          await new Promise((r) => setTimeout(r, 1000));
          const retryRoles = await fetchRoles(currentSession.user.id);
          setRoles(retryRoles.length > 0 ? retryRoles : ["client"]);
        }
      } else if (data?.already_setup) {
        console.log("[useAuth] User already set up, refreshing roles...");
        const newRoles = await fetchRoles(currentSession.user.id);
        setRoles(newRoles.length > 0 ? newRoles : ["client"]);
      }
    } catch (err) {
      console.error("[useAuth] Auto-accept failed:", err);
    }
  }, [fetchRoles]);

  useEffect(() => {
    let mounted = true;

    const handleSession = async (session: Session | null) => {
      if (!mounted) return;

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        let fetched = await fetchRoles(session.user.id);

        // If no roles found, wait briefly for trigger and retry
        if (fetched.length === 0) {
          await new Promise((r) => setTimeout(r, 500));
          fetched = await fetchRoles(session.user.id);
        }

        if (mounted) {
          if (fetched.length > 0) {
            setRoles(fetched);
          } else {
            // Still no roles — try auto-accept as last resort
            setRoles(["client"]); // Optimistic default
            tryAutoAcceptInvite(session);
          }
          setLoading(false);
        }

        // Even with roles, check if coach_clients is missing (safety net)
        if (fetched.includes("client") || fetched.length === 0) {
          const { data: coachLink } = await supabase
            .from("coach_clients")
            .select("id")
            .eq("client_id", session.user.id)
            .eq("status", "active")
            .maybeSingle();

          if (!coachLink && mounted) {
            tryAutoAcceptInvite(session);
          }
        }
      } else {
        if (mounted) {
          setRoles([]);
          setLoading(false);
          autoAcceptAttempted.current = false;
        }
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        await handleSession(session);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchRoles, tryAutoAcceptInvite]);

  // Primary role for backward compat: admin > coach > client
  const role: AppRole | null = roles.includes("admin")
    ? "admin"
    : roles.includes("coach")
    ? "coach"
    : roles.length > 0
    ? roles[0]
    : null;

  const hasRole = (r: AppRole) => roles.includes(r);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRoles([]);
    autoAcceptAttempted.current = false;
  };

  return { user, session, role, roles, hasRole, loading, signOut };
}
