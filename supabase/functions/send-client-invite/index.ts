// auth-utils v3 — direct REST validation
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthenticatedUser } from "../_shared/auth-utils.ts";
import { getOrCreateInviteEmailToken } from "../_shared/invite-email-utils.ts";

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

    const authResult = await requireAuthenticatedUser(req);
    if ("error" in authResult) {
      return jsonResponse({ error: authResult.error }, authResult.status);
    }

    const { user } = authResult;

    // Check role
    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const userRoles = (rolesData || []).map((r: any) => r.role);
    if (!userRoles.includes("coach") && !userRoles.includes("admin")) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const body = await req.json();
    const { email, first_name, last_name, phone, client_type, tags, invite_id, tier_id, tier_name, assigned_coach_id } = body;

    if (!email || !first_name || !last_name) {
      return jsonResponse({ error: "Email, first name, and last name are required" }, 400);
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
      console.error("[send-client-invite] Insert error:", insertError);
      return jsonResponse({ error: "Failed to create invite" }, 500);
    }

    console.log("[send-client-invite] Invite created:", invite.id, "for:", email.toLowerCase());

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
      console.log("[send-client-invite] Create user result:", createUserError.message);
    }

    // Queue branded invite email via enqueue_email (pgmq)
    const messageId = `client-invite-${invite.id}-${Date.now()}`;
    const emailHtml = buildInviteEmailHtml(first_name, coachName, setupUrl);
    const emailText = `Hi ${first_name},\n\n${coachName} has invited you to join Physique Crafters. Set up your account to start your training program.\n\nGet Started: ${setupUrl}\n\nThis link expires in 7 days.\n\nDownload the App:\nApp Store: ${APP_STORE_URL}\nGoogle Play: ${PLAY_STORE_URL}`;

    let emailSent = false;
    try {
      const emailTokenResult = await getOrCreateInviteEmailToken(supabase, email);

      if (!emailTokenResult.canSend) {
        console.warn("[send-client-invite] Invite email suppressed for:", email.toLowerCase());
      } else {
      const { error: queueError } = await supabase.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          to: email.toLowerCase(),
          from: "Physique Crafters <noreply@notify.physiquecrafters.com>",
          sender_domain: "notify.physiquecrafters.com",
          subject: `${coachName} has invited you to join Physique Crafters`,
          html: emailHtml,
          text: emailText,
          purpose: "transactional",
          label: "client_invite",
          unsubscribe_token: emailTokenResult.unsubscribeToken,
          idempotency_key: messageId,
          message_id: messageId,
          queued_at: new Date().toISOString(),
        },
      });

      if (queueError) {
        console.error("[send-client-invite] Queue error:", queueError);
      } else {
        emailSent = true;
        console.log("[send-client-invite] Email queued successfully, message_id:", messageId);
      }
      }
    } catch (queueErr) {
      console.error("[send-client-invite] Queue exception:", queueErr);
    }

    return jsonResponse({
      success: true,
      email_sent: emailSent,
      invite: {
        id: invite.id,
        email: invite.email,
        first_name: invite.first_name,
        last_name: invite.last_name,
        invite_status: invite.invite_status,
        expires_at: invite.expires_at,
        setup_url: setupUrl,
      },
      coach_name: coachName,
    }, 200);
  } catch (err) {
    console.error("[send-client-invite] Error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
