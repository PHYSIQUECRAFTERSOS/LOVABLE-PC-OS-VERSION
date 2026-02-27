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

/**
 * Ensures all required records exist for a client user.
 * Uses upserts to be idempotent — safe to call multiple times.
 */
async function ensureClientRecords(
  supabase: any,
  userId: string,
  coachId: string,
  fullName: string,
  tags: string[] | null
) {
  // 1. Ensure profile exists
  const { error: profileError } = await supabase
    .from("profiles")
    .upsert(
      { user_id: userId, full_name: fullName },
      { onConflict: "user_id" }
    );
  if (profileError) console.error("[ensure] Profile upsert error:", profileError);
  else console.log("[ensure] Profile OK for:", userId);

  // 2. Ensure user_roles has 'client' role
  const { error: roleError } = await supabase
    .from("user_roles")
    .upsert(
      { user_id: userId, role: "client" },
      { onConflict: "user_id,role" }
    );
  if (roleError) console.error("[ensure] Role upsert error:", roleError);
  else console.log("[ensure] Role OK for:", userId);

  // 3. Ensure coach_clients assignment exists
  // Check first to avoid duplicate key errors (no unique constraint on coach_id+client_id)
  const { data: existingAssignment } = await supabase
    .from("coach_clients")
    .select("id")
    .eq("coach_id", coachId)
    .eq("client_id", userId)
    .maybeSingle();

  if (!existingAssignment) {
    const { error: assignError } = await supabase.from("coach_clients").insert({
      coach_id: coachId,
      client_id: userId,
      status: "active",
    });
    if (assignError) console.error("[ensure] Coach assign error:", assignError);
    else console.log("[ensure] Coach assignment created for:", userId);
  } else {
    // Ensure it's active
    await supabase
      .from("coach_clients")
      .update({ status: "active" })
      .eq("id", existingAssignment.id);
    console.log("[ensure] Coach assignment already exists, ensured active:", userId);
  }

  // 4. Add tags if any
  if (tags && tags.length > 0) {
    for (const tag of tags) {
      const { data: existingTag } = await supabase
        .from("client_tags")
        .select("id")
        .eq("client_id", userId)
        .eq("coach_id", coachId)
        .eq("tag", tag)
        .maybeSingle();

      if (!existingTag) {
        await supabase.from("client_tags").insert({
          client_id: userId,
          coach_id: coachId,
          tag,
        });
      }
    }
    console.log("[ensure] Tags processed for:", userId);
  }
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
    const { token, password, action } = body;

    console.log("[validate-invite-token] Action:", action, "Token present:", !!token);

    // NEW: "auto-accept" action — called post-login to bind user to pending invite
    if (action === "auto-accept") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return jsonResponse({ success: false, message: "Unauthorized" }, 401);
      }

      const { data: { user }, error: authErr } = await supabase.auth.getUser(
        authHeader.replace("Bearer ", "")
      );
      if (authErr || !user) {
        return jsonResponse({ success: false, message: "Unauthorized" }, 401);
      }

      console.log("[auto-accept] Checking pending invites for:", user.email);

      // Find any pending invite for this user's email
      const { data: pendingInvites } = await supabase
        .from("client_invites")
        .select("*")
        .eq("email", user.email!.toLowerCase())
        .eq("invite_status", "pending")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });

      if (!pendingInvites || pendingInvites.length === 0) {
        // Also check if user already has coach_clients (already set up)
        const { data: existingAssignment } = await supabase
          .from("coach_clients")
          .select("id")
          .eq("client_id", user.id)
          .eq("status", "active")
          .maybeSingle();

        if (existingAssignment) {
          return jsonResponse({ success: true, message: "Already set up", already_setup: true }, 200);
        }

        return jsonResponse({ success: false, message: "No pending invites found", errorCode: "NO_INVITE" }, 200);
      }

      // Accept the most recent pending invite
      const invite = pendingInvites[0];
      const fullName = `${invite.first_name} ${invite.last_name}`;

      console.log("[auto-accept] Accepting invite:", invite.id, "for user:", user.id);

      await ensureClientRecords(supabase, user.id, invite.assigned_coach_id, fullName, invite.tags);

      // Mark invite as accepted
      await supabase
        .from("client_invites")
        .update({
          invite_status: "accepted",
          accepted_at: new Date().toISOString(),
          created_client_id: user.id,
        })
        .eq("id", invite.id);

      console.log("[auto-accept] Complete for:", user.email);

      return jsonResponse({
        success: true,
        message: "Invite accepted and access granted",
        accepted: true,
      }, 200);
    }

    if (!token) {
      return jsonResponse({ success: false, message: "Token is required", errorCode: "MISSING_TOKEN" }, 400);
    }

    // Look up invite
    const { data: invite, error: lookupError } = await supabase
      .from("client_invites")
      .select("*")
      .eq("invite_token", token)
      .maybeSingle();

    if (lookupError) {
      console.error("[validate-invite-token] Lookup error:", lookupError);
      return jsonResponse({ success: false, message: "Failed to look up invite", errorCode: "LOOKUP_ERROR" }, 500);
    }

    if (!invite) {
      console.log("[validate-invite-token] No invite found for token");
      return jsonResponse({ success: false, message: "Invalid invite link", errorCode: "INVALID_TOKEN" }, 200);
    }

    console.log("[validate-invite-token] Invite found:", invite.id, "Status:", invite.invite_status, "Email:", invite.email);

    // Check if already used
    if (invite.invite_status === "accepted") {
      return jsonResponse({ success: false, message: "This invite has already been used", errorCode: "ALREADY_USED" }, 200);
    }

    if (invite.invite_status === "invalidated") {
      return jsonResponse({ success: false, message: "This invite has been invalidated", errorCode: "INVALIDATED" }, 200);
    }

    // Check expiration
    if (new Date(invite.expires_at) < new Date()) {
      await supabase
        .from("client_invites")
        .update({ invite_status: "expired" })
        .eq("id", invite.id);

      return jsonResponse({ success: false, message: "This invite has expired", errorCode: "EXPIRED" }, 200);
    }

    // If action is "validate" - just return invite info
    if (action === "validate") {
      const { data: coachProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", invite.assigned_coach_id)
        .single();

      return jsonResponse({
        success: true,
        valid: true,
        invite: {
          first_name: invite.first_name,
          last_name: invite.last_name,
          email: invite.email,
          coach_name: coachProfile?.full_name || "Your Coach",
        },
      }, 200);
    }

    // Action is "setup" - create the account
    if (action === "setup") {
      if (!password || password.length < 8) {
        return jsonResponse({ success: false, message: "Password must be at least 8 characters", errorCode: "WEAK_PASSWORD" }, 200);
      }

      console.log("[validate-invite-token] Creating/activating user for:", invite.email);

      let userId: string;
      const fullName = `${invite.first_name} ${invite.last_name}`;

      // Try to create user first
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: invite.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

      if (createError) {
        console.log("[validate-invite-token] Create user result:", createError.message);

        if (createError.message?.includes("already been registered")) {
          // User exists — find them and update password
          const { data: { users } } = await supabase.auth.admin.listUsers({
            page: 1,
            perPage: 1000,
          });
          const existingUser = (users || []).find(
            (u: any) => u.email?.toLowerCase() === invite.email.toLowerCase()
          );

          if (!existingUser) {
            return jsonResponse({
              success: false,
              message: "Unable to locate your account. Please contact your coach.",
              errorCode: "USER_LOOKUP_FAILED",
            }, 200);
          }

          // Update password and confirm email
          const { error: updateError } = await supabase.auth.admin.updateUserById(existingUser.id, {
            password,
            email_confirm: true,
            user_metadata: { full_name: fullName },
          });

          if (updateError) {
            console.error("[validate-invite-token] Update user error:", updateError.message);
            return jsonResponse({
              success: false,
              message: "We're having trouble activating your account. Please try again or contact support.",
              errorCode: "UPDATE_FAILED",
            }, 200);
          }

          userId = existingUser.id;
          console.log("[validate-invite-token] Existing user activated:", userId);
        } else {
          return jsonResponse({
            success: false,
            message: "We're having trouble creating your account. Please try again or contact support.",
            errorCode: "CREATE_FAILED",
          }, 200);
        }
      } else {
        userId = newUser.user.id;
        console.log("[validate-invite-token] New user created:", userId);
      }

      // *** CRITICAL: Ensure ALL client records exist using idempotent upserts ***
      await ensureClientRecords(supabase, userId, invite.assigned_coach_id, fullName, invite.tags);

      // Mark invite as accepted
      await supabase
        .from("client_invites")
        .update({
          invite_status: "accepted",
          accepted_at: new Date().toISOString(),
          created_client_id: userId,
        })
        .eq("id", invite.id);

      // Record legal acceptances
      const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        || req.headers.get("cf-connecting-ip")
        || "unknown";

      if (body.legal_acceptances && Array.isArray(body.legal_acceptances)) {
        const acceptanceRows = body.legal_acceptances.map((acc: any) => ({
          user_id: userId,
          document_id: acc.document_id,
          document_type: acc.document_type,
          document_version: acc.document_version,
          ip_address: clientIp,
          app_version: "1.0.0",
        }));

        const { error: legalError } = await supabase
          .from("legal_acceptances")
          .insert(acceptanceRows);

        if (legalError) {
          console.error("[validate-invite-token] Legal acceptance insert error:", legalError);
        } else {
          console.log("[validate-invite-token] Legal acceptances recorded for:", userId);
        }
      }

      console.log("[validate-invite-token] Setup complete for:", invite.email);

      return jsonResponse({
        success: true,
        message: "Account created successfully",
        email: invite.email,
      }, 200);
    }

    return jsonResponse({ success: false, message: "Invalid action", errorCode: "INVALID_ACTION" }, 200);
  } catch (err) {
    console.error("[validate-invite-token] Unhandled error:", err);
    return jsonResponse({
      success: false,
      message: "We're having trouble confirming your account. Please try again or contact support.",
      errorCode: "SERVER_ERROR",
    }, 200);
  }
});
