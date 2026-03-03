import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

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
  
  // Guard: prevent concurrent handleSession calls from racing
  const processingSessionRef = useRef(false);
  const lastProcessedUserId = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const fetchRoles = useCallback(async (userId: string): Promise<AppRole[]> => {
    try {
      console.log("[useAuth] Fetching roles for", userId.slice(0, 8));
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
        if (mountedRef.current) {
          const finalRoles = newRoles.length > 0 ? newRoles : ["client" as AppRole];
          setRoles(finalRoles);
          setCachedRoles(finalRoles);
          setRoleLoading(false);
        }
      } else if (data?.already_setup) {
        const newRoles = await fetchRoles(currentSession.user.id);
        if (mountedRef.current) {
          const finalRoles = newRoles.length > 0 ? newRoles : ["client" as AppRole];
          setRoles(finalRoles);
          setCachedRoles(finalRoles);
          setRoleLoading(false);
        }
      }
    } catch (err) {
      console.error("[useAuth] Auto-accept failed:", err);
    }
  }, [fetchRoles]);

  useEffect(() => {
    mountedRef.current = true;

    const handleSession = async (newSession: Session | null) => {
      if (!mountedRef.current) return;

      // === NO SESSION ===
      if (!newSession?.user) {
        console.log("[useAuth] No session, clearing state");
        setSession(null);
        setUser(null);
        setRoles([]);
        clearCachedRoles();
        setLoading(false);
        setRoleLoading(false);
        autoAcceptAttempted.current = false;
        lastProcessedUserId.current = null;
        processingSessionRef.current = false;
        return;
      }

      const userId = newSession.user.id;

      // === SAME USER already processed — skip duplicate calls ===
      if (lastProcessedUserId.current === userId && !loading) {
        console.log("[useAuth] Session for same user already processed, skipping");
        // Still update session/user refs in case tokens refreshed
        setSession(newSession);
        setUser(newSession.user);
        return;
      }

      // === ALREADY PROCESSING this user — skip race ===
      if (processingSessionRef.current && lastProcessedUserId.current === userId) {
        console.log("[useAuth] Already processing session for this user, skipping duplicate");
        return;
      }

      processingSessionRef.current = true;
      console.log("[useAuth] Processing session for", userId.slice(0, 8));

      // Set user/session immediately so ProtectedRoute sees a user
      setSession(newSession);
      setUser(newSession.user);

      // Use cached roles for instant render — don't reset roleLoading if we have cache
      const cached = getCachedRoles();
      if (cached.length > 0) {
        setRoles(cached);
        setRoleLoading(false);
        setLoading(false);
        console.log("[useAuth] Instant render with cached roles:", cached);
      }

      // Fetch fresh roles from DB
      let fetched = await fetchRoles(userId);

      // Single brief retry if empty
      if (fetched.length === 0) {
        await new Promise((r) => setTimeout(r, 300));
        fetched = await fetchRoles(userId);
      }

      if (!mountedRef.current) {
        processingSessionRef.current = false;
        return;
      }

      if (fetched.length > 0) {
        setRoles(fetched);
        setCachedRoles(fetched);
        setRoleLoading(false);
        setLoading(false);
      } else if (cached.length > 0) {
        // Keep cached roles, we're fine
        setRoleLoading(false);
        setLoading(false);
      } else {
        // No roles found anywhere — try auto-accept, then default
        console.warn("[useAuth] No roles found, attempting auto-accept");
        tryAutoAcceptInvite(newSession);
        // Give auto-accept 2s, then fallback
        setTimeout(() => {
          if (mountedRef.current) {
            setRoles(prev => {
              if (prev.length === 0) {
                const fallback: AppRole[] = ["client"];
                setCachedRoles(fallback);
                return fallback;
              }
              return prev;
            });
            setRoleLoading(false);
            setLoading(false);
          }
        }, 2000);
      }

      lastProcessedUserId.current = userId;
      processingSessionRef.current = false;

      // Background: check client assignment
      if (fetched.includes("client") || fetched.length === 0) {
        const { data: coachLink } = await supabase
          .from("coach_clients")
          .select("id")
          .eq("client_id", userId)
          .eq("status", "active")
          .maybeSingle();

        if (!coachLink && mountedRef.current) {
          tryAutoAcceptInvite(newSession);
        }
      }
    };

    // Set up auth listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        console.log("[useAuth] onAuthStateChange event:", _event);
        await handleSession(session);
      }
    );

    // Then check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log("[useAuth] getSession result:", session ? "has session" : "no session");
      handleSession(session);
    });

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
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
    lastProcessedUserId.current = null;
  };

  console.log("[useAuth] State:", { userId: user?.id?.slice(0, 8), role, roles, loading, roleLoading });

  return { user, session, role, roles, hasRole, loading, roleLoading, signOut };
}
