import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { TIMEOUTS } from "@/lib/performance";

type AppRole = "admin" | "coach" | "client";

const ROLE_CACHE_KEY = "pc_cached_roles";

function getCachedRoles(): AppRole[] {
  try {
    const cached = sessionStorage.getItem(ROLE_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch {}
  return [];
}

function setCachedRoles(roles: AppRole[]) {
  try {
    sessionStorage.setItem(ROLE_CACHE_KEY, JSON.stringify(roles));
  } catch {}
}

function clearCachedRoles() {
  try {
    sessionStorage.removeItem(ROLE_CACHE_KEY);
  } catch {}
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>(getCachedRoles);
  const [loading, setLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(true);
  const autoAcceptAttempted = useRef(false);
  const loadingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchRoles = useCallback(async (userId: string): Promise<AppRole[]> => {
    try {
      console.log("[useAuth] Fetching roles for", userId);
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      const fetched = (data || []).map((r) => r.role as AppRole);
      console.log("[useAuth] Roles fetched:", fetched);
      return fetched.length > 0 ? fetched : [];
    } catch (err) {
      console.error("[useAuth] fetchRoles error:", err);
      return [];
    }
  }, []);

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
        const newRoles = await fetchRoles(currentSession.user.id);
        if (newRoles.length > 0) {
          setRoles(newRoles);
          setCachedRoles(newRoles);
          setRoleLoading(false);
        } else {
          await new Promise((r) => setTimeout(r, 500));
          const retryRoles = await fetchRoles(currentSession.user.id);
          const finalRoles = retryRoles.length > 0 ? retryRoles : ["client" as AppRole];
          setRoles(finalRoles);
          setCachedRoles(finalRoles);
          setRoleLoading(false);
        }
      } else if (data?.already_setup) {
        const newRoles = await fetchRoles(currentSession.user.id);
        const finalRoles = newRoles.length > 0 ? newRoles : ["client" as AppRole];
        setRoles(finalRoles);
        setCachedRoles(finalRoles);
        setRoleLoading(false);
      }
    } catch (err) {
      console.error("[useAuth] Auto-accept failed:", err);
    }
  }, [fetchRoles]);

  useEffect(() => {
    let mounted = true;

    // Hard timeout — never block loading beyond 3s
    loadingTimeout.current = setTimeout(() => {
      if (mounted && loading) {
        console.warn("[useAuth] Loading timed out after 3s, forcing complete");
        setLoading(false);
        setRoleLoading(false);
      }
    }, TIMEOUTS.SPINNER_MAX);

    const handleSession = async (session: Session | null) => {
      if (!mounted) return;

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        // Use cached roles immediately for instant render
        const cached = getCachedRoles();
        if (cached.length > 0) {
          setRoles(cached);
          setRoleLoading(false);
          console.log("[useAuth] Using cached roles:", cached);
        }

        let fetched = await fetchRoles(session.user.id);

        // If no roles found, single brief retry
        if (fetched.length === 0) {
          await new Promise((r) => setTimeout(r, 300));
          fetched = await fetchRoles(session.user.id);
        }

        if (mounted) {
          if (fetched.length > 0) {
            setRoles(fetched);
            setCachedRoles(fetched);
            setRoleLoading(false);
          } else if (cached.length === 0) {
            // Only default to client if no cached roles AND no DB roles
            // This is a true new user with no role assignment yet
            console.warn("[useAuth] No roles found, attempting auto-accept before defaulting");
            tryAutoAcceptInvite(session);
            // After auto-accept attempt, if still no roles, default
            setTimeout(() => {
              if (mounted) {
                setRoles(prev => {
                  if (prev.length === 0) {
                    const fallback: AppRole[] = ["client"];
                    setCachedRoles(fallback);
                    return fallback;
                  }
                  return prev;
                });
                setRoleLoading(false);
              }
            }, 2000);
          }
          setLoading(false);
        }

        // Background check for client assignment
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
          clearCachedRoles();
          setLoading(false);
          setRoleLoading(false);
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
      if (loadingTimeout.current) clearTimeout(loadingTimeout.current);
    };
  }, [fetchRoles, tryAutoAcceptInvite]);

  // Primary role: admin > coach > client
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
    clearCachedRoles();
    autoAcceptAttempted.current = false;
  };

  console.log("[useAuth] State:", { userId: user?.id?.slice(0, 8), role, roles, loading, roleLoading });

  return { user, session, role, roles, hasRole, loading, roleLoading, signOut };
}
