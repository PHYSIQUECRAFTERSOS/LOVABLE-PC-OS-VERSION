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
    const { token } = await req.json();

    if (!token || typeof token !== "string" || token.length < 10) {
      return new Response(
        JSON.stringify({ error: "Invalid or missing token." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find the deletion request by token
    const { data: request, error: fetchError } = await supabaseAdmin
      .from("deletion_requests")
      .select("*")
      .eq("token", token)
      .eq("status", "pending")
      .maybeSingle();

    if (fetchError || !request) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired deletion token." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check token expiry
    if (new Date(request.token_expires_at) < new Date()) {
      await supabaseAdmin
        .from("deletion_requests")
        .update({ status: "cancelled" })
        .eq("id", request.id);

      return new Response(
        JSON.stringify({ error: "This deletion link has expired. Please submit a new request." }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find user by email
    const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
    const matchedUser = usersData?.users?.find(
      (u) => u.email?.toLowerCase() === request.email.toLowerCase()
    );

    // Update request status
    await supabaseAdmin
      .from("deletion_requests")
      .update({
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        user_id: matchedUser?.id || null,
      })
      .eq("id", request.id);

    // If user exists, ban them (soft delete)
    if (matchedUser) {
      await supabaseAdmin.auth.admin.updateUserById(matchedUser.id, {
        ban_duration: "876000h",
        user_metadata: {
          deletion_requested: true,
          deletion_requested_at: new Date().toISOString(),
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Account deletion confirmed. All data will be permanently removed within 30 days.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[ConfirmDeletion] Error:", err);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
