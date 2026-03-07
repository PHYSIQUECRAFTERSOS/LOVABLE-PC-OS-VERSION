import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify calling user is a coach/admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check role - user may have multiple roles
    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const userRoles = (rolesData || []).map((r: any) => r.role);
    if (!userRoles.includes("coach") && !userRoles.includes("admin")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { email, first_name, last_name, phone, client_type, tags, invite_id, tier_id, tier_name } = body;

    if (!email || !first_name || !last_name) {
      return new Response(
        JSON.stringify({ error: "Email, first name, and last name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate secure token (128-bit)
    const tokenBytes = new Uint8Array(16);
    crypto.getRandomValues(tokenBytes);
    const token = Array.from(tokenBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // If this is a resend, invalidate the old invite
    if (invite_id) {
      await supabase
        .from("client_invites")
        .update({ invite_status: "invalidated", updated_at: new Date().toISOString() })
        .eq("id", invite_id)
        .eq("assigned_coach_id", user.id);
    }

    // Check if there's already a pending invite for this email from this coach
    const { data: existing } = await supabase
      .from("client_invites")
      .select("id")
      .eq("email", email.toLowerCase())
      .eq("assigned_coach_id", user.id)
      .eq("invite_status", "pending")
      .maybeSingle();

    if (existing && !invite_id) {
      // Invalidate existing pending invite
      await supabase
        .from("client_invites")
        .update({ invite_status: "invalidated" })
        .eq("id", existing.id);
    }

    // Create the invite record
    const { data: invite, error: insertError } = await supabase
      .from("client_invites")
      .insert({
        email: email.toLowerCase(),
        first_name,
        last_name,
        phone: phone || null,
        client_type: client_type || "full_access",
        assigned_coach_id: user.id,
        invite_token: token,
        invite_status: "pending",
        expires_at: expiresAt,
        tags: tags || [],
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to create invite" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get coach name for email
    const { data: coachProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .single();

    const coachName = coachProfile?.full_name || "Your Coach";

    // Build the setup URL - use the origin from the request or fallback
    const origin = req.headers.get("origin") || "https://physique-crafters-os.lovable.app";
    const setupUrl = `${origin}/setup?token=${token}`;

    // Send invite email via Supabase Auth admin
    const { error: emailError } = await supabase.auth.admin.inviteUserByEmail(email.toLowerCase(), {
      data: {
        full_name: `${first_name} ${last_name}`,
        invite_token: token,
        invited_by: user.id,
      },
      redirectTo: setupUrl,
    });

    let emailSent = true;
    if (emailError) {
      console.error("Email send failed:", emailError.message);
      emailSent = false;
    } else {
      console.log("Invite email sent successfully to:", email.toLowerCase());
    }

    return new Response(
      JSON.stringify({
        success: true,
        email_sent: emailSent,
        invite: {
          id: invite.id,
          email: invite.email,
          first_name: invite.first_name,
          last_name: invite.last_name,
          invite_status: invite.invite_status,
          expires_at: invite.expires_at,
          setup_url: emailSent ? undefined : setupUrl,
        },
        coach_name: coachName,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
