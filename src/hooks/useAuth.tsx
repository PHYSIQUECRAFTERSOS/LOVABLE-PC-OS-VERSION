import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

type AppRole = "admin" | "coach" | "client";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  roles: AppRole[];
  hasRole: (r: AppRole) => boolean;
  loading: boolean;
  roleLoading: boolean;
  signOut: () => Promise<void>;
}

const ROLE_CACHE_PREFIX = "pc_cached_roles";
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getRoleCacheKey(userId: string) {
  return `${ROLE_CACHE_PREFIX}:${userId}`;
}

function getCachedRoles(userId: string): AppRole[] {
  try {
    // Try localStorage first (persists across cold launches)
    const cached = localStorage.getItem(getRoleCacheKey(userId));
    if (cached) return JSON.parse(cached);
    // Fallback to sessionStorage for backward compat
    const sessionCached = sessionStorage.getItem(getRoleCacheKey(userId));
    if (sessionCached) {
      // Migrate to localStorage
      localStorage.setItem(getRoleCacheKey(userId), sessionCached);
      sessionStorage.removeItem(getRoleCacheKey(userId));
      return JSON.parse(sessionCached);
    }
  } catch {}
  return [];
}

function setCachedRoles(userId: string, roles: AppRole[]) {
  try {
    localStorage.setItem(getRoleCacheKey(userId), JSON.stringify(roles));
    // Clean up old sessionStorage entry
    sessionStorage.removeItem(getRoleCacheKey(userId));
  } catch {}
}

function clearCachedRoles(userId?: string) {
  try {
    if (userId) {
      localStorage.removeItem(getRoleCacheKey(userId));
      sessionStorage.removeItem(getRoleCacheKey(userId));
      return;
    }
    // Clear all
    for (const storage of [localStorage, sessionStorage]) {
      Object.keys(storage)
        .filter((key) => key.startsWith(`${ROLE_CACHE_PREFIX}:`))
        .forEach((key) => storage.removeItem(key));
    }
  } catch {}
}

function areRolesEqual(current: AppRole[], next: AppRole[]) {
  if (current.length !== next.length) return false;
  const left = [...current].sort();
  const right = [...next].sort();
  return left.every((role, index) => role === right[index]);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(false);

  const mountedRef = useRef(true);
  const activeUserIdRef = useRef<string | null>(null);
  const autoAcceptAttempted = useRef(false);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const rolesRef = useRef<AppRole[]>([]);

  const setRolesIfChanged = useCallback((nextRoles: AppRole[]) => {
    rolesRef.current = nextRoles;
    setRoles((prev) => (areRolesEqual(prev, nextRoles) ? prev : nextRoles));
  }, []);

  const fetchRoles = useCallback(async (userId: string): Promise<AppRole[]> => {
    try {
      const rolePromise = supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      // Increase timeout to 8s to avoid false negatives on slow networks
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("role_fetch_timeout")), 8000);
      });

      const { data } = (await Promise.race([rolePromise, timeoutPromise])) as {
        data: { role: string }[] | null;
      };

      return (data || []).map((r) => r.role as AppRole);
    } catch (error) {
      console.error("[auth] fetchRoles failed:", error);
      return [];
    }
  }, []);

  const tryAutoAcceptInvite = useCallback(async (currentSession: Session) => {
    if (autoAcceptAttempted.current) return;
    autoAcceptAttempted.current = true;

    // Only run auto-accept if user came from an invite link
    const url = new URL(window.location.href);
    const hasInviteToken = url.searchParams.has("invite") || url.pathname.includes("/accept-invite");
    if (!hasInviteToken) {
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("validate-invite-token", {
        body: { action: "auto-accept" },
      });

      if (error || (!data?.accepted && !data?.already_setup)) return;

      const freshRoles = await fetchRoles(currentSession.user.id);
      if (!mountedRef.current || currentSession.user.id !== activeUserIdRef.current) return;

      if (freshRoles.length > 0) {
        setRolesIfChanged(freshRoles);
        setCachedRoles(currentSession.user.id, freshRoles);
      }
      setRoleLoading(false);
    } catch (error) {
      console.error("[auth] auto-accept failed:", error);
    }
  }, [fetchRoles, setRolesIfChanged]);

  const syncTimezone = useCallback(async (userId: string) => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Vancouver";
      const { data: profile } = await supabase
        .from("profiles")
        .select("timezone")
        .eq("user_id", userId)
        .single();
      if (profile && profile.timezone !== tz) {
        await supabase
          .from("profiles")
          .update({ timezone: tz } as any)
          .eq("user_id", userId);
      }
    } catch {
      /* non-critical */
    }
  }, []);

  const resolveSession = useCallback(async (incomingSession: Session | null) => {
    if (!mountedRef.current) return;

    if (!incomingSession?.user) {
      const previousUserId = activeUserIdRef.current;

      setSession(null);
      setUser(null);
      setRolesIfChanged([]);
      setRoleLoading(false);
      setLoading(false);
      activeUserIdRef.current = null;
      autoAcceptAttempted.current = false;

      if (previousUserId) clearCachedRoles(previousUserId);

      console.log("[auth] session resolved: anonymous");
      return;
    }

    const currentUserId = incomingSession.user.id;
    const previousUserId = activeUserIdRef.current;
    const isSameUser = previousUserId === currentUserId;
    activeUserIdRef.current = currentUserId;

    setSession((prev) => {
      if (
        prev?.user?.id === currentUserId &&
        prev.access_token === incomingSession.access_token &&
        prev.refresh_token === incomingSession.refresh_token &&
        prev.expires_at === incomingSession.expires_at
      ) {
        return prev;
      }
      return incomingSession;
    });
    setUser((prev) => (prev?.id === currentUserId ? prev : incomingSession.user));
    setLoading(false);

    if (!isSameUser) {
      syncTimezone(currentUserId);
    }

    // Use cached roles immediately so UI doesn't stall
    const cachedRoles = getCachedRoles(currentUserId);
    const currentRoles = rolesRef.current;
    const effectiveRoles = cachedRoles.length > 0 ? cachedRoles : currentRoles;

    if (effectiveRoles.length > 0) {
      setRolesIfChanged(effectiveRoles);
      // Don't set roleLoading=true if we have cached roles — user can proceed immediately
      setRoleLoading(false);
    } else {
      setRoleLoading(true);
    }

    // Background fetch of fresh roles
    if (!isSameUser || currentRoles.length === 0) {
      let fetchedRoles = await fetchRoles(currentUserId);

      // Only try auto-accept for brand new users with no roles AND invite context
      if (fetchedRoles.length === 0 && effectiveRoles.length === 0) {
        await tryAutoAcceptInvite(incomingSession);
        fetchedRoles = await fetchRoles(currentUserId);
      }

      if (!mountedRef.current || activeUserIdRef.current !== currentUserId) return;

      if (fetchedRoles.length > 0) {
        setRolesIfChanged(fetchedRoles);
        setCachedRoles(currentUserId, fetchedRoles);
      } else if (cachedRoles.length === 0) {
        setRolesIfChanged([]);
      }
      // If fetchedRoles is empty but cachedRoles exist, keep using cached roles

      console.log("[auth] session resolved:", {
        userId: currentUserId.slice(0, 8),
        roles: fetchedRoles.length > 0 ? fetchedRoles : effectiveRoles,
      });
    } else {
      console.log("[auth] session refreshed:", {
        userId: currentUserId.slice(0, 8),
        roles: effectiveRoles,
      });
    }

    setRoleLoading(false);
  }, [fetchRoles, setRolesIfChanged, tryAutoAcceptInvite, syncTimezone]);

  useEffect(() => {
    mountedRef.current = true;

    const enqueueResolution = (incomingSession: Session | null) => {
      queueRef.current = queueRef.current
        .then(() => resolveSession(incomingSession))
        .catch((error) => {
          console.error("[auth] resolve queue error:", error);
          if (mountedRef.current) {
            setLoading(false);
            setRoleLoading(false);
          }
        });
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, incomingSession) => {
      console.log("[auth] onAuthStateChange:", event);
      enqueueResolution(incomingSession);
    });

    supabase.auth
      .getSession()
      .then(({ data: { session: currentSession } }) => {
        console.log("[auth] getSession:", currentSession ? "has session" : "no session");
        enqueueResolution(currentSession);
      })
      .catch((error) => {
        console.error("[auth] getSession failed:", error);
        if (mountedRef.current) {
          setLoading(false);
          setRoleLoading(false);
        }
      });

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [resolveSession]);

  const role: AppRole | null = roles.includes("admin")
    ? "admin"
    : roles.includes("coach")
      ? "coach"
      : roles.includes("client")
        ? "client"
        : null;

  const hasRole = useCallback((r: AppRole) => roles.includes(r), [roles]);

  const signOut = useCallback(async () => {
    const userId = activeUserIdRef.current;
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRolesIfChanged([]);
    setLoading(false);
    setRoleLoading(false);
    autoAcceptAttempted.current = false;
    activeUserIdRef.current = null;
    if (userId) clearCachedRoles(userId);
  }, [setRolesIfChanged]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      role,
      roles,
      hasRole,
      loading,
      roleLoading,
      signOut,
    }),
    [user, session, role, roles, hasRole, loading, roleLoading, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
