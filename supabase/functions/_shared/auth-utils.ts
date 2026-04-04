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

  if (!supabaseUrl) {
    console.error("[auth-utils] Missing SUPABASE_URL");
    return { error: "Server configuration error", status: 500 };
  }

  try {
    // Call the Supabase Auth API directly to validate the JWT
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: authHeader,
        apikey: Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[auth-utils] Auth API returned", res.status, body);
      return { error: "Unauthorized", status: 401 };
    }

    const user = await res.json();

    if (!user || !user.id) {
      console.error("[auth-utils] No user in auth response");
      return { error: "Unauthorized", status: 401 };
    }

    return { user };
  } catch (err) {
    console.error("[auth-utils] Auth validation error:", err);
    return { error: "Unauthorized", status: 401 };
  }
}
