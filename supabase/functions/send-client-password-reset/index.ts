import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);
    const callerId = claimsData.claims.sub as string;

    const { clientId, redirectTo } = await req.json();
    if (!clientId) return json({ error: "Missing clientId" }, 400);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const isAdmin = callerRoles?.some((r: any) => r.role === "admin");
    const isManager = callerRoles?.some((r: any) => r.role === "manager");
    const isCoach = callerRoles?.some((r: any) =>
      r.role === "coach" || r.role === "admin" || r.role === "manager"
    );
    if (!isCoach) return json({ error: "Unauthorized: coach or admin role required" }, 403);

    // Coaches may only reset their own clients; admins/managers have full access.
    if (!isAdmin && !isManager) {
      const { data: assignment } = await adminClient
        .from("coach_clients")
        .select("id")
        .eq("client_id", clientId)
        .eq("coach_id", callerId)
        .maybeSingle();
      if (!assignment) return json({ error: "Client not found or not assigned to you" }, 403);
    }

    const { data: userRes, error: userErr } = await adminClient.auth.admin.getUserById(clientId);
    if (userErr || !userRes?.user?.email) {
      return json({ error: "This client has no email on file yet" }, 404);
    }
    const email = userRes.user.email.toLowerCase();

    // Trigger GoTrue's recovery flow so the branded reset email (auth-email-hook) is sent.
    const { error: resetError } = await userClient.auth.resetPasswordForEmail(email, {
      redirectTo: typeof redirectTo === "string" && redirectTo.startsWith("http")
        ? redirectTo
        : undefined,
    });

    if (resetError) {
      console.error("[send-client-password-reset] reset failed", resetError);
      const rateLimited = /rate/i.test(resetError.message || "");
      return json(
        {
          error: rateLimited
            ? "Too many reset emails sent recently. Try again in a few minutes."
            : "Failed to send reset email",
        },
        rateLimited ? 429 : 500,
      );
    }

    console.log("[send-client-password-reset] sent", { clientId, by: callerId });
    return json({ success: true, email });
  } catch (err) {
    console.error("[send-client-password-reset] error", err);
    return json({ error: "Unexpected error" }, 500);
  }
});
