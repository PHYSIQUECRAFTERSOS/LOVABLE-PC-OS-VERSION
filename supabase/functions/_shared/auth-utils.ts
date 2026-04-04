import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type AuthenticatedUserResult =
  | { user: any }
  | { error: string; status: number };

export async function requireAuthenticatedUser(
  req: Request,
): Promise<AuthenticatedUserResult> {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return { error: "Unauthorized", status: 401 };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY")
    ?? Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !publishableKey) {
    console.error("[auth-utils] Missing auth environment variables");
    return { error: "Server configuration error", status: 500 };
  }

  const token = authHeader.replace("Bearer ", "");

  const authClient = createClient(supabaseUrl, publishableKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(token);

  if (error || !user) {
    console.error("[auth-utils] Failed to validate auth token", error);
    return { error: "Unauthorized", status: 401 };
  }

  return { user };
}