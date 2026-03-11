import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Step 1: Validate coach auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("[resend-invite] No auth header");
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      console.error("[resend-invite] Auth failed:", authError?.message);
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // Check coach/admin role
    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const userRoles = (rolesData || []).map((r: any) => r.role);
    if (!userRoles.includes("coach") && !userRoles.includes("admin")) {
      console.error("[resend-invite] Forbidden for user:", user.id);
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const body = await req.json();
    const { invite_id } = body;

    if (!invite_id) {
      return jsonResponse({ error: "invite_id is required" }, 400);
    }

    console.log("[resend-invite] Resending invite:", invite_id, "by coach:", user.id);

    // Step 2: Fetch existing invite
    const { data: invite, error: fetchError } = await supabase
      .from("client_invites")
      .select("*")
      .eq("id", invite_id)
      .eq("assigned_coach_id", user.id)
      .maybeSingle();

    if (fetchError || !invite) {
      console.error("[resend-invite] Invite not found:", fetchError?.message);
      return jsonResponse({ error: "Invite not found" }, 404);
    }

    console.log("[resend-invite] Current invite status:", invite.invite_status, "Email:", invite.email);

    // Only allow resend for pending, expired, or invalidated
    if (invite.invite_status === "accepted") {
      return jsonResponse({ error: "This invite has already been accepted. Cannot resend." }, 400);
    }

    // Step 3: Generate NEW token
    const tokenBytes = new Uint8Array(16);
    crypto.getRandomValues(tokenBytes);
    const newToken = Array.from(tokenBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    console.log("[resend-invite] New token generated, expires:", newExpiresAt);

    // Step 4: Update invite record
    const { error: updateError } = await supabase
      .from("client_invites")
      .update({
        invite_token: newToken,
        invite_status: "pending",
        expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invite_id);

    if (updateError) {
      console.error("[resend-invite] DB update failed:", updateError.message);
      return jsonResponse({ error: "Failed to update invite record" }, 500);
    }

    console.log("[resend-invite] Invite record updated successfully");

    // Step 5: Build setup URL
    const origin = req.headers.get("origin") || "https://app.physiquecrafters.com";
    const setupUrl = `${origin}/setup?token=${newToken}`;

    // Step 6: Send email
    // Check if auth user already exists for this email
    const { data: listData } = await supabase.auth.admin.listUsers();
    const existingAuthUser = listData?.users?.find(
      (u: any) => u.email?.toLowerCase() === invite.email.toLowerCase()
    );

    let emailSent = false;
    let emailMethod = "";

    if (existingAuthUser) {
      // User exists in auth — cannot use inviteUserByEmail.
      // Delete the auth user (only safe because invite is NOT accepted) and re-invite.
      console.log("[resend-invite] Auth user exists:", existingAuthUser.id, "- deleting to re-invite");
      const { error: deleteError } = await supabase.auth.admin.deleteUser(existingAuthUser.id);
      if (deleteError) {
        console.error("[resend-invite] Failed to delete auth user:", deleteError.message);
        // Fall through — we'll try inviteUserByEmail anyway and return URL as fallback
      } else {
        console.log("[resend-invite] Auth user deleted, re-inviting...");
      }
    }

    // Send email via inviteUserByEmail
    const { error: emailError } = await supabase.auth.admin.inviteUserByEmail(
      invite.email.toLowerCase(),
      {
        data: {
          full_name: `${invite.first_name} ${invite.last_name}`,
          invite_token: newToken,
          invited_by: user.id,
        },
        redirectTo: setupUrl,
      }
    );

    if (emailError) {
      console.error("[resend-invite] inviteUserByEmail failed:", emailError.message);
      emailMethod = "manual";
      emailSent = false;
    } else {
      console.log("[resend-invite] Email sent successfully via inviteUserByEmail");
      emailSent = true;
      emailMethod = "supabase_invite";
    }

    // Get coach name
    const { data: coachProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .single();

    console.log("[resend-invite] Complete. Email sent:", emailSent, "Method:", emailMethod);

    return jsonResponse({
      success: true,
      email_sent: emailSent,
      email_method: emailMethod,
      invite_id: invite.id,
      setup_url: emailSent ? undefined : setupUrl,
      resent_at: new Date().toISOString(),
      coach_name: coachProfile?.full_name || "Coach",
    }, 200);
  } catch (err) {
    console.error("[resend-invite] Unhandled error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});