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

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildInviteEmailHtml(firstName: string, coachName: string, setupUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td align="center" style="padding-bottom:32px;">
          <h1 style="margin:0;font-size:28px;font-weight:800;letter-spacing:2px;color:#ffffff;">
            PHYSIQUE <span style="color:#D4A017;">CRAFTERS</span>
          </h1>
          <p style="margin:6px 0 0;font-size:11px;letter-spacing:3px;color:#888888;text-transform:uppercase;">
            The Triple O Method
          </p>
        </td></tr>
        <tr><td style="background-color:#1a1a1a;border-radius:12px;padding:36px 32px;">
          <p style="margin:0 0 8px;font-size:18px;color:#ffffff;font-weight:600;">
            Hi ${firstName},
          </p>
          <p style="margin:0 0 24px;font-size:14px;color:#cccccc;line-height:1.6;">
            <strong style="color:#ffffff;">${coachName}</strong> has invited you to join
            <strong style="color:#D4A017;">Physique Crafters</strong>. Set up your account
            to start your training program.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding-bottom:28px;">
              <a href="${setupUrl}" target="_blank"
                style="display:inline-block;background-color:#D4A017;color:#000000;font-size:15px;font-weight:700;
                text-decoration:none;padding:14px 40px;border-radius:8px;letter-spacing:0.5px;">
                Get Started
              </a>
            </td></tr>
          </table>
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

    // Validate coach auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // Check coach/admin role
    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const userRoles = (rolesData || []).map((r: any) => r.role);
    if (!userRoles.includes("coach") && !userRoles.includes("admin")) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const body = await req.json();
    const { invite_id } = body;

    if (!invite_id) {
      return jsonResponse({ error: "invite_id is required" }, 400);
    }

    console.log("[resend-invite] Resending invite:", invite_id, "by coach:", user.id);

    // Fetch existing invite
    const { data: invite, error: fetchError } = await supabase
      .from("client_invites")
      .select("*")
      .eq("id", invite_id)
      .eq("assigned_coach_id", user.id)
      .maybeSingle();

    if (fetchError || !invite) {
      return jsonResponse({ error: "Invite not found" }, 404);
    }

    if (invite.invite_status === "accepted") {
      return jsonResponse({ error: "This invite has already been accepted. Cannot resend." }, 400);
    }

    // Generate NEW token
    const tokenBytes = new Uint8Array(16);
    crypto.getRandomValues(tokenBytes);
    const newToken = Array.from(tokenBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // Update invite record
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
      return jsonResponse({ error: "Failed to update invite record" }, 500);
    }

    // Build setup URL
    const origin = req.headers.get("origin") || "https://physique-crafters-os.lovable.app";
    const setupUrl = `${origin}/setup?token=${newToken}`;

    // Ensure auth user exists for this email
    const { error: createUserError } = await supabase.auth.admin.createUser({
      email: invite.email.toLowerCase(),
      email_confirm: true,
      user_metadata: {
        full_name: `${invite.first_name} ${invite.last_name}`,
        invite_token: newToken,
        invited_by: user.id,
      },
    });

    if (createUserError) {
      console.log("[resend-invite] Create user result:", createUserError.message);
      // User likely already exists — that's fine
    }

    // Get coach name
    const { data: coachProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .single();

    const coachName = coachProfile?.full_name || "Coach";

    // Send branded email
    let emailSent = false;
    try {
      const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
      const emailHtml = buildInviteEmailHtml(invite.first_name, coachName, setupUrl);

      await sendLovableEmail({
        apiKey: lovableApiKey,
        to: invite.email.toLowerCase(),
        from: "Physique Crafters <noreply@notify.physiquecrafters.com>",
        subject: `${coachName} has invited you to join Physique Crafters`,
        html: emailHtml,
      });

      emailSent = true;
      console.log("[resend-invite] Branded email sent to:", invite.email.toLowerCase());
    } catch (emailErr) {
      console.error("[resend-invite] Email send failed:", emailErr);
    }

    return jsonResponse({
      success: true,
      email_sent: emailSent,
      invite_id: invite.id,
      setup_url: emailSent ? undefined : setupUrl,
      resent_at: new Date().toISOString(),
      coach_name: coachName,
    }, 200);
  } catch (err) {
    console.error("[resend-invite] Unhandled error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
