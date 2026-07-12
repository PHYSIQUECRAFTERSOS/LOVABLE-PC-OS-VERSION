import { supabase } from "@/integrations/supabase/client";

export const AUTH_RESTORE_TIMEOUT_MS = 10000;
export const AUTH_ACTION_TIMEOUT_MS = 12000;

export class AuthTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthTimeoutError";
  }
}

export function withAuthTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AuthTimeoutError(message)), timeoutMs);
  });

  return Promise.race([Promise.resolve(promise), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export function clearLocalAuthState() {
  try {
    for (const storage of [localStorage, sessionStorage]) {
      Object.keys(storage)
        .filter(
          (key) =>
            key === "supabase.auth.token" ||
            key.startsWith("pc_cached_roles:") ||
            (key.startsWith("sb-") && key.includes("-auth-token"))
        )
        .forEach((key) => storage.removeItem(key));
    }
  } catch (error) {
    console.warn("[auth] local auth cleanup skipped:", error);
  }
}

export async function resetAuthAndRedirect(path = "/auth") {
  try {
    await withAuthTimeout(
      supabase.auth.signOut({ scope: "local" }),
      1500,
      "Local sign-out took too long. Resetting saved login."
    );
  } catch {
    // If the auth client is locked, local storage cleanup below is the recovery path.
  }

  clearLocalAuthState();
  window.location.replace(path);
}