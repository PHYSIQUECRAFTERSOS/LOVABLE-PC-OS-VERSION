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
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[auth-utils] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return { error: "Server configuration error", status: 500 };
  }

  const token = authHeader.replace("Bearer ", "");

  // Use service role client with auth.getUser(jwt) to validate the token
  // without relying on session storage
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error,
  } = await serviceClient.auth.getUser(token);

  if (error || !user) {
    console.error("[auth-utils] Failed to validate auth token", error);
    return { error: "Unauthorized", status: 401 };
  }

  return { user };
}
