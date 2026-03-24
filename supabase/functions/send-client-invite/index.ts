import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendLovableEmail } from "npm:@lovable.dev/email-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const APP_STORE_URL = "https://apps.apple.com/ca/app/physique-crafters/id6760598660";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.physiquecrafters.app.twa";

function buildInviteEmailHtml(firstName: string, coachName: string, setupUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <!-- Logo -->
        <tr><td align="center" style="padding-bottom:32px;">
          <h1 style="margin:0;font-size:28px;font-weight:800;letter-spacing:2px;color:#ffffff;">
            PHYSIQUE <span style="color:#D4A017;">CRAFTERS</span>
          </h1>
          <p style="margin:6px 0 0;font-size:11px;letter-spacing:3px;color:#888888;text-transform:uppercase;">
            The Triple O Method
          </p>
        </td></tr>

        <!-- Main Card -->
        <tr><td style="background-color:#1a1a1a;border-radius:12px;padding:36px 32px;">
          <p style="margin:0 0 8px;font-size:18px;color:#ffffff;font-weight:600;">
            Hi ${firstName},
          </p>
          <p style="margin:0 0 24px;font-size:14px;color:#cccccc;line-height:1.6;">
            <strong style="color:#ffffff;">${coachName}</strong> has invited you to join
            <strong style="color:#D4A017;">Physique Crafters</strong>. Set up your account
            to start your training program.
          </p>

          <!-- CTA Button -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding-bottom:28px;">
              <a href="${setupUrl}" target="_blank"
                style="display:inline-block;background-color:#D4A017;color:#000000;font-size:15px;font-weight:700;
                text-decoration:none;padding:14px 40px;border-radius:8px;letter-spacing:0.5px;">
                Get Started
              </a>
            </td></tr>
          </table>

          <!-- Divider -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="border-top:1px solid #333333;padding-top:24px;">
              <p style="margin:0 0 16px;font-size:14px;color:#ffffff;font-weight:600;text-align:center;">
                Download the App
              </p>
              <p style="margin:0 0 20px;font-size:12px;color:#999999;text-align:center;line-height:1.5;">
                For the best experience, download the Physique Crafters app on your device.
              </p>
            </td></tr>
          </table>

          <!-- App Store Buttons -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="padding-bottom:12px;">
                <a href="${APP_STORE_URL}" target="_blank"
                  style="display:inline-block;background-color:#ffffff;color:#000000;font-size:13px;font-weight:700;
                  text-decoration:none;padding:12px 24px;border-radius:8px;margin:0 6px;">
                  🍎 App Store
                </a>
                <a href="${PLAY_STORE_URL}" target="_blank"
                  style="display:inline-block;background-color:#ffffff;color:#000000;font-size:13px;font-weight:700;
                  text-decoration:none;padding:12px 24px;border-radius:8px;margin:0 6px;">
                  ▶️ Google Play
                </a>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="padding-top:24px;">
          <p style="margin:0;font-size:11px;color:#666666;line-height:1.5;">
            This link expires in 7 days.<br/>
            If you didn't expect this email, you can safely ignore it.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

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

    // Check role
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
    const { email, first_name, last_name, phone, client_type, tags, invite_id, tier_id, tier_name, assigned_coach_id } = body;

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
        assigned_coach_id: assigned_coach_id || user.id,
        invite_token: token,
        invite_status: "pending",
        expires_at: expiresAt,
        tags: tags || [],
        tier_id: tier_id || null,
        tier_name: tier_name || null,
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

    // Build the setup URL
    const origin = req.headers.get("origin") || "https://physique-crafters-os.lovable.app";
    const setupUrl = `${origin}/setup?token=${token}`;

    // Pre-create the auth user so they can set their password on the setup page
    const { error: createUserError } = await supabase.auth.admin.createUser({
      email: email.toLowerCase(),
      email_confirm: true,
      user_metadata: {
        full_name: `${first_name} ${last_name}`,
        invite_token: token,
        invited_by: user.id,
      },
    });

    if (createUserError) {
      // If user already exists, that's OK — they'll use the setup page
      console.log("Create user result:", createUserError.message);
    }

    // Send branded invite email
    let emailSent = true;
    try {
      const emailHtml = buildInviteEmailHtml(first_name, coachName, setupUrl);

      await sendLovableEmail({
        to: email.toLowerCase(),
        from: "Physique Crafters <noreply@notify.physiquecrafters.com>",
        subject: `${coachName} has invited you to join Physique Crafters`,
        html: emailHtml,
      });

      console.log("Branded invite email sent to:", email.toLowerCase());
    } catch (emailErr) {
      console.error("Email send failed:", emailErr);
      emailSent = false;
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
