import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Theme = "light" | "dark";
const STORAGE_KEY = "pc.theme";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function readInitial(): Theme {
  if (typeof document === "undefined") return "dark";
  // Pre-paint script in index.html already set the class — trust it.
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

function applyToDOM(t: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", t === "dark");
  root.classList.toggle("light", t === "light");
  root.setAttribute("data-theme", t);

  // PWA / browser chrome
  const bg = t === "dark" ? "#0a0a0a" : "#f7f6f3";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", bg);

  // Capacitor native status bar (lazy import so web build never crashes)
  if (Capacitor.isNativePlatform()) {
    import("@capacitor/status-bar")
      .then(({ StatusBar, Style }) => {
        StatusBar.setStyle({ style: t === "dark" ? Style.Dark : Style.Light }).catch(() => {});
        StatusBar.setBackgroundColor?.({ color: bg }).catch(() => {});
      })
      .catch(() => {});
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [theme, setThemeState] = useState<Theme>(readInitial);

  // Apply on every change (instant, no transition).
  useEffect(() => {
    applyToDOM(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {}
  }, [theme]);

  // Reconcile with server-side preference once user is known.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("theme_preference")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        const serverTheme = (data as any).theme_preference as Theme | null;
        if (serverTheme === "light" || serverTheme === "dark") {
          if (serverTheme !== theme) setThemeState(serverTheme);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const setTheme = useCallback(
    (next: Theme) => {
      setThemeState(next); // Instant local apply via effect above.
      if (!user?.id) return;
      // Promise.allSettled-style fire-and-forget; never reverts visible choice on failure.
      Promise.allSettled([
        supabase.from("profiles").update({ theme_preference: next } as any).eq("user_id", user.id),
      ]).catch(() => {});
    },
    [user?.id]
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      toggle: () => setTheme(theme === "dark" ? "light" : "dark"),
    }),
    [theme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fallback safety: hook can be called even before provider mounts (rare).
    return {
      theme: readInitial(),
      setTheme: () => {},
      toggle: () => {},
    };
  }
  return ctx;
}
