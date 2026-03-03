import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { source, email, full_name, reason } = await req.json();

    // ── Public form submission ──
    if (source === "public_form") {
      if (!email) {
        return new Response(
          JSON.stringify({ error: "Email is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Rate limit: max 3 requests per email per hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await supabaseAdmin
        .from("deletion_requests")
        .select("*", { count: "exact", head: true })
        .eq("email", email.toLowerCase().trim())
        .gte("created_at", oneHourAgo);

      if ((count ?? 0) >= 3) {
        return new Response(
          JSON.stringify({ error: "Too many requests. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Generate secure token
      const token = crypto.randomUUID() + "-" + crypto.randomUUID();
      const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const ip = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";

      // Don't reveal whether the email exists (prevent enumeration)
      const { data: userLookup } = await supabaseAdmin
        .from("profiles")
        .select("user_id")
        .eq("user_id", (
          await supabaseAdmin.auth.admin.listUsers()
        ).data.users.find(u => u.email?.toLowerCase() === email.toLowerCase().trim())?.id ?? "00000000-0000-0000-0000-000000000000")
        .maybeSingle();

      // Always insert the request (prevents enumeration)
      await supabaseAdmin.from("deletion_requests").insert({
        email: email.toLowerCase().trim(),
        full_name: full_name || null,
        reason: reason || null,
        source: "public_form",
        token,
        token_expires_at: tokenExpiresAt,
        ip_address: ip,
        status: "pending",
      });

      // Always return success (prevents email enumeration)
      return new Response(
        JSON.stringify({
          success: true,
          message: "If an account with that email exists, a confirmation link has been sent.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── In-app authenticated deletion ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getUser();
    if (claimsError || !claimsData?.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const user = claimsData.user;
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";

    // Check for existing pending request
    const { data: existing } = await supabaseAdmin
      .from("deletion_requests")
      .select("id")
      .eq("user_id", user.id)
      .in("status", ["pending", "confirmed", "processing"])
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ error: "A deletion request is already pending for this account." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create deletion request
    const { error: insertError } = await supabaseAdmin.from("deletion_requests").insert({
      user_id: user.id,
      email: user.email || "",
      full_name: full_name || null,
      reason: reason || null,
      source: "in_app",
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      ip_address: ip,
    });

    if (insertError) {
      console.error("[Deletion] Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to process deletion request." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Soft-delete: disable the user immediately
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      ban_duration: "876000h", // ~100 years = effectively permanent
      user_metadata: { deletion_requested: true, deletion_requested_at: new Date().toISOString() },
    });

    if (updateError) {
      console.error("[Deletion] Ban error:", updateError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Your account has been scheduled for deletion. All data will be permanently removed within 30 days.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[Deletion] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
