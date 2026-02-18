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

    const body = await req.json();
    const { token, password, action } = body;

    console.log("[validate-invite-token] Action:", action, "Token present:", !!token);

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

      console.log("[validate-invite-token] Creating user for:", invite.email);

      // Create user account via admin API
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: invite.email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: `${invite.first_name} ${invite.last_name}`,
        },
      });

      if (createError) {
        console.error("[validate-invite-token] Create user error:", createError.message);

        if (createError.message?.includes("already been registered")) {
          return jsonResponse({
            success: false,
            message: "An account with this email already exists. Please sign in instead.",
            errorCode: "USER_EXISTS",
          }, 200);
        }

        return jsonResponse({
          success: false,
          message: "We're having trouble creating your account. Please try again or contact support.",
          errorCode: "CREATE_FAILED",
        }, 200);
      }

      const userId = newUser.user.id;
      console.log("[validate-invite-token] User created:", userId);

      // Create coach_clients assignment
      const { error: assignError } = await supabase.from("coach_clients").insert({
        coach_id: invite.assigned_coach_id,
        client_id: userId,
        status: "active",
      });
      if (assignError) console.error("[validate-invite-token] Coach assign error:", assignError);

      // Add tags if any
      if (invite.tags && invite.tags.length > 0) {
        const tagInserts = invite.tags.map((tag: string) => ({
          client_id: userId,
          coach_id: invite.assigned_coach_id,
          tag,
        }));
        await supabase.from("client_tags").insert(tagInserts);
      }

      // Mark invite as accepted
      await supabase
        .from("client_invites")
        .update({
          invite_status: "accepted",
          accepted_at: new Date().toISOString(),
          created_client_id: userId,
        })
        .eq("id", invite.id);

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
