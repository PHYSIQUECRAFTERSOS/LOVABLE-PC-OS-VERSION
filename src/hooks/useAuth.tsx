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
    const cached = sessionStorage.getItem(getRoleCacheKey(userId));
    if (cached) return JSON.parse(cached);
  } catch {}
  return [];
}

function setCachedRoles(userId: string, roles: AppRole[]) {
  try {
    sessionStorage.setItem(getRoleCacheKey(userId), JSON.stringify(roles));
  } catch {}
}

function clearCachedRoles(userId?: string) {
  try {
    if (userId) {
      sessionStorage.removeItem(getRoleCacheKey(userId));
      return;
    }

    Object.keys(sessionStorage)
      .filter((key) => key.startsWith(`${ROLE_CACHE_PREFIX}:`))
      .forEach((key) => sessionStorage.removeItem(key));
  } catch {}
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

  const fetchRoles = useCallback(async (userId: string): Promise<AppRole[]> => {
    try {
      const rolePromise = supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("role_fetch_timeout")), 3000);
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

    try {
      const { data, error } = await supabase.functions.invoke("validate-invite-token", {
        body: { action: "auto-accept" },
      });

      if (error || (!data?.accepted && !data?.already_setup)) return;

      const freshRoles = await fetchRoles(currentSession.user.id);
      if (!mountedRef.current || currentSession.user.id !== activeUserIdRef.current) return;

      if (freshRoles.length > 0) {
        setRoles(freshRoles);
        setCachedRoles(currentSession.user.id, freshRoles);
      }
      setRoleLoading(false);
    } catch (error) {
      console.error("[auth] auto-accept failed:", error);
    }
  }, [fetchRoles]);

  const resolveSession = useCallback(async (incomingSession: Session | null) => {
    if (!mountedRef.current) return;

    if (!incomingSession?.user) {
      const previousUserId = activeUserIdRef.current;

      setSession(null);
      setUser(null);
      setRoles([]);
      setRoleLoading(false);
      setLoading(false);
      activeUserIdRef.current = null;
      autoAcceptAttempted.current = false;

      if (previousUserId) clearCachedRoles(previousUserId);

      console.log("[auth] session resolved: anonymous");
      return;
    }

    const currentUserId = incomingSession.user.id;
    activeUserIdRef.current = currentUserId;

    setSession(incomingSession);
    setUser(incomingSession.user);
    setLoading(false);

    const cached = getCachedRoles(currentUserId);
    if (cached.length > 0) {
      setRoles(cached);
      setRoleLoading(false);
    } else {
      setRoleLoading(true);
    }

    let fetchedRoles = await fetchRoles(currentUserId);

    if (fetchedRoles.length === 0) {
      await tryAutoAcceptInvite(incomingSession);
      fetchedRoles = await fetchRoles(currentUserId);
    }

    if (!mountedRef.current || activeUserIdRef.current !== currentUserId) return;

    if (fetchedRoles.length > 0) {
      setRoles(fetchedRoles);
      setCachedRoles(currentUserId, fetchedRoles);
    } else if (cached.length === 0) {
      setRoles([]);
    }

    setRoleLoading(false);

    console.log("[auth] session resolved:", {
      userId: currentUserId.slice(0, 8),
      roles: fetchedRoles.length > 0 ? fetchedRoles : cached,
    });
  }, [fetchRoles, tryAutoAcceptInvite]);

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
    setRoles([]);
    setLoading(false);
    setRoleLoading(false);
    autoAcceptAttempted.current = false;
    activeUserIdRef.current = null;
    if (userId) clearCachedRoles(userId);
  }, []);

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

