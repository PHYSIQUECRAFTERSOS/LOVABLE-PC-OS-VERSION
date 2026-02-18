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

    const body = await req.json();
    const { token, password, action } = body;

    if (!token) {
      return new Response(JSON.stringify({ error: "Token is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up invite
    const { data: invite, error: lookupError } = await supabase
      .from("client_invites")
      .select("*")
      .eq("invite_token", token)
      .maybeSingle();

    if (lookupError || !invite) {
      return new Response(
        JSON.stringify({ error: "Invalid invite link", code: "INVALID_TOKEN" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if already used
    if (invite.invite_status === "accepted") {
      return new Response(
        JSON.stringify({ error: "This invite has already been used", code: "ALREADY_USED" }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (invite.invite_status === "invalidated") {
      return new Response(
        JSON.stringify({ error: "This invite has been invalidated", code: "INVALIDATED" }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check expiration
    if (new Date(invite.expires_at) < new Date()) {
      // Update status to expired
      await supabase
        .from("client_invites")
        .update({ invite_status: "expired" })
        .eq("id", invite.id);

      return new Response(
        JSON.stringify({ error: "This invite has expired", code: "EXPIRED" }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If action is "validate" - just return invite info
    if (action === "validate") {
      // Get coach name
      const { data: coachProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", invite.assigned_coach_id)
        .single();

      return new Response(
        JSON.stringify({
          valid: true,
          invite: {
            first_name: invite.first_name,
            last_name: invite.last_name,
            email: invite.email,
            coach_name: coachProfile?.full_name || "Your Coach",
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action is "setup" - create the account
    if (action === "setup") {
      if (!password || password.length < 8) {
        return new Response(
          JSON.stringify({ error: "Password must be at least 8 characters" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

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
        // If user already exists, try to sign them in instead
        if (createError.message?.includes("already been registered")) {
          return new Response(
            JSON.stringify({ error: "An account with this email already exists. Please sign in.", code: "USER_EXISTS" }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        console.error("Create user error:", createError);
        return new Response(
          JSON.stringify({ error: "Failed to create account" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const userId = newUser.user.id;

      // Create coach_clients assignment
      await supabase.from("coach_clients").insert({
        coach_id: invite.assigned_coach_id,
        client_id: userId,
        status: "active",
      });

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

      return new Response(
        JSON.stringify({
          success: true,
          message: "Account created successfully",
          email: invite.email,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
