import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Ensure staff role is assigned. Idempotent. */
async function ensureStaffRole(supabase: any, userId: string, role: string, firstName?: string, lastName?: string) {
  await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "client");

  const { error } = await supabase.from("user_roles").upsert(
    { user_id: userId, role },
    { onConflict: "user_id,role" }
  );
  if (error) console.error("[staff-invite] Role upsert error:", error);
  else console.log("[staff-invite] Role assigned:", role, "for user:", userId);

  const profileData: Record<string, unknown> = { user_id: userId };
  if (firstName || lastName) {
    profileData.full_name = `${firstName || ""} ${lastName || ""}`.trim();
  } else {
    profileData.full_name = "";
  }
  await supabase.from("profiles").upsert(profileData, { onConflict: "user_id" });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { action } = body;

    // ── VALIDATE ──
    if (action === "validate") {
      const { token } = body;
      if (!token) return json({ success: false, errorCode: "INVALID" });

      const { data: invite } = await supabase
        .from("staff_invites")
        .select("*")
        .eq("invite_token", token)
        .maybeSingle();

      if (!invite) return json({ success: false, errorCode: "INVALID" });
      if (invite.used) return json({ success: false, errorCode: "ALREADY_USED" });
      if (new Date(invite.expires_at) < new Date()) return json({ success: false, errorCode: "EXPIRED" });

      return json({ success: true, valid: true, invite: { email: invite.email, role: invite.role } });
    }

    // ── SEND INVITE ──
    if (action === "send") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json({ error: "Unauthorized" }, 401);

      const { data: { user }, error: authErr } = await supabase.auth.getUser(
        authHeader.replace("Bearer ", "")
      );
      if (authErr || !user) return json({ error: "Unauthorized" }, 401);

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      const isAdmin = (roles || []).some((r: any) => r.role === "admin");
      if (!isAdmin) return json({ error: "Only admins can invite staff" }, 403);

      const { email, role, first_name, last_name } = body;
      if (!email) return json({ error: "Email is required" }, 400);
      if (!first_name?.trim() || !last_name?.trim()) {
        return json({ error: "First and last name are required" }, 400);
      }
      if (!["coach", "admin"].includes(role)) {
        return json({ error: "Role must be coach or admin" }, 400);
      }

      const { data: existing } = await supabase
        .from("staff_invites")
        .select("id")
        .eq("email", email.toLowerCase())
        .eq("used", false)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (existing) {
        return json({ error: "A pending invite already exists for this email" }, 400);
      }

      const tokenBytes = new Uint8Array(16);
      crypto.getRandomValues(tokenBytes);
      const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, "0")).join("");

      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

      const { error: insertErr } = await supabase.from("staff_invites").insert({
        email: email.toLowerCase(),
        role,
        invited_by: user.id,
        invite_token: token,
        expires_at: expiresAt,
        first_name: first_name.trim(),
        last_name: last_name.trim(),
      });

      if (insertErr) {
        console.error("[staff-invite] Insert error:", insertErr);
        return json({ error: "Failed to create invite" }, 500);
      }

      const origin = req.headers.get("origin") || "https://physique-crafters-os.lovable.app";
      const setupUrl = `${origin}/accept-invite?token=${token}`;

      let emailSent = true;

      // Try Auth admin invite first
      const { error: emailErr } = await supabase.auth.admin.inviteUserByEmail(
        email.toLowerCase(),
        {
          data: {
            staff_invite_token: token,
            invited_by: user.id,
            staff_role: role,
          },
          redirectTo: setupUrl,
        }
      );

      if (emailErr) {
        console.warn("[staff-invite] inviteUserByEmail failed:", emailErr.message);

        // If user already exists, queue email via enqueue_email
        if (emailErr.message?.includes("already been registered")) {
          console.log("[staff-invite] User exists, queueing direct email");
          try {
            const roleName = role === "admin" ? "Manager" : "Coach";
            const html = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0a0a0a; color: #e5e5e5;">
                <h1 style="color: #D4A017; font-size: 24px; margin-bottom: 16px;">You're Invited to Join Physique Crafters</h1>
                <p style="font-size: 16px; line-height: 1.6; margin-bottom: 8px;">Hi ${first_name},</p>
                <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px;">You've been invited to join the Physique Crafters team as a <strong style="color: #D4A017;">${roleName}</strong>.</p>
                <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px;">Click the button below to set up your account. This link expires in 48 hours.</p>
                <div style="text-align: center; margin: 32px 0;">
                  <a href="${setupUrl}" style="display: inline-block; padding: 14px 32px; background-color: #D4A017; color: #0a0a0a; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">Accept Invitation</a>
                </div>
                <p style="font-size: 14px; color: #888; margin-top: 32px;">If you didn't expect this invite, you can safely ignore this email.</p>
              </div>
            `;

            const messageId = `staff-invite-${token}-${Date.now()}`;
            const { error: queueError } = await supabase.rpc("enqueue_email", {
              queue_name: "transactional_emails",
              payload: {
                to: email.toLowerCase(),
                from: "Physique Crafters <noreply@notify.physiquecrafters.com>",
                sender_domain: "notify.physiquecrafters.com",
                subject: `You're invited to join Physique Crafters as a ${roleName}`,
                html,
                purpose: "transactional",
                label: "staff_invite",
                message_id: messageId,
              },
            });

            if (queueError) {
              console.error("[staff-invite] Queue error:", queueError);
              emailSent = false;
            } else {
              console.log("[staff-invite] Email queued, message_id:", messageId);
            }
          } catch (directErr) {
            console.error("[staff-invite] Queue exception:", directErr);
            emailSent = false;
          }
        } else {
          emailSent = false;
        }
      }

      return json({
        success: true,
        email_sent: emailSent,
        setup_url: emailSent ? undefined : setupUrl,
      });
    }

    // ── ACCEPT INVITE ──
    if (action === "accept") {
      const { token, password } = body;
      if (!token) return json({ success: false, message: "Token required", errorCode: "INVALID" });

      const { data: invite, error: lookupErr } = await supabase
        .from("staff_invites")
        .select("*")
        .eq("invite_token", token)
        .maybeSingle();

      if (lookupErr || !invite) {
        return json({ success: false, message: "Invalid invite link", errorCode: "INVALID" });
      }

      if (invite.used) {
        return json({ success: false, message: "This invite has already been used", errorCode: "ALREADY_USED" });
      }

      if (new Date(invite.expires_at) < new Date()) {
        return json({ success: false, message: "This invite has expired (48h limit)", errorCode: "EXPIRED" });
      }

      if (!password || password.length < 8) {
        return json({ success: false, message: "Password must be at least 8 characters", errorCode: "WEAK_PASSWORD" });
      }

      let userId: string;
      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email: invite.email,
        password,
        email_confirm: true,
        user_metadata: { staff_role: invite.role },
      });

      if (createErr) {
        if (createErr.message?.includes("already been registered")) {
          const { data: { users } } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
          const existing = (users || []).find((u: any) => u.email?.toLowerCase() === invite.email.toLowerCase());
          if (!existing) {
            return json({ success: false, message: "Unable to locate account", errorCode: "NOT_FOUND" });
          }
          await supabase.auth.admin.updateUserById(existing.id, {
            password,
            email_confirm: true,
          });
          userId = existing.id;
        } else {
          console.error("[staff-invite] Create error:", createErr);
          return json({ success: false, message: "Failed to create account", errorCode: "CREATE_FAILED" });
        }
      } else {
        userId = newUser.user.id;
      }

      await ensureStaffRole(supabase, userId, invite.role, invite.first_name, invite.last_name);

      await supabase.from("staff_invites").update({
        used: true,
        accepted_at: new Date().toISOString(),
        created_user_id: userId,
      }).eq("id", invite.id);

      console.log("[staff-invite] Accept complete for:", invite.email, "role:", invite.role, "userId:", userId);

      return json({ success: true, email: invite.email });
    }

    // ── DEACTIVATE STAFF ──
    if (action === "deactivate_staff") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json({ error: "Unauthorized" }, 401);
      const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      if (authErr || !caller) return json({ error: "Unauthorized" }, 401);

      const { data: callerRoles } = await supabase.from("user_roles").select("role").eq("user_id", caller.id);
      if (!(callerRoles || []).some((r: any) => r.role === "admin")) return json({ error: "Only admins can deactivate staff" }, 403);

      const { staff_user_id } = body;
      if (!staff_user_id) return json({ error: "staff_user_id required" }, 400);
      if (staff_user_id === caller.id) return json({ error: "Cannot deactivate yourself" }, 400);

      await supabase.auth.admin.updateUserById(staff_user_id, { ban_duration: "876000h" });
      await supabase.from("user_roles").delete().eq("user_id", staff_user_id);
      await supabase.from("coach_clients").update({ status: "deactivated" }).eq("coach_id", staff_user_id);

      return json({ success: true });
    }

    // ── DELETE STAFF ──
    if (action === "delete_staff") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json({ error: "Unauthorized" }, 401);
      const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      if (authErr || !caller) return json({ error: "Unauthorized" }, 401);

      const { data: callerRoles } = await supabase.from("user_roles").select("role").eq("user_id", caller.id);
      if (!(callerRoles || []).some((r: any) => r.role === "admin")) return json({ error: "Only admins can delete staff" }, 403);

      const { staff_user_id } = body;
      if (!staff_user_id) return json({ error: "staff_user_id required" }, 400);
      if (staff_user_id === caller.id) return json({ error: "Cannot delete yourself" }, 400);

      await supabase.from("user_roles").delete().eq("user_id", staff_user_id);
      await supabase.from("profiles").delete().eq("user_id", staff_user_id);
      await supabase.from("coach_clients").delete().eq("coach_id", staff_user_id);
      await supabase.auth.admin.deleteUser(staff_user_id);

      return json({ success: true });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (err) {
    console.error("[staff-invite] Error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
