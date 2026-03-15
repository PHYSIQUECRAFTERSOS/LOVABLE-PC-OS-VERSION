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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const coachId = claimsData.claims.sub as string;

    // Parse body
    const { action, clientId } = await req.json();
    if (!action || !clientId) {
      return new Response(JSON.stringify({ error: "Missing action or clientId" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Admin client for auth operations
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify coach owns this client
    const { data: assignment, error: assignErr } = await adminClient
      .from("coach_clients")
      .select("id, status")
      .eq("coach_id", coachId)
      .eq("client_id", clientId)
      .maybeSingle();

    if (assignErr || !assignment) {
      return new Response(JSON.stringify({ error: "Client not found or not assigned to you" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "deactivate") {
      // Update status
      const { error: updateErr } = await adminClient
        .from("coach_clients")
        .update({ status: "deactivated" })
        .eq("id", assignment.id);
      if (updateErr) throw updateErr;

      // Ban user from logging in (100 year ban = soft deactivation)
      const { error: banErr } = await adminClient.auth.admin.updateUserById(clientId, {
        ban_duration: "876000h",
      });
      if (banErr) {
        console.error("Ban error (non-fatal):", banErr);
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "reactivate") {
      // Update status back to active
      const { error: updateErr } = await adminClient
        .from("coach_clients")
        .update({ status: "active" })
        .eq("id", assignment.id);
      if (updateErr) throw updateErr;

      // Remove ban
      const { error: unbanErr } = await adminClient.auth.admin.updateUserById(clientId, {
        ban_duration: "none",
      });
      if (unbanErr) {
        console.error("Unban error (non-fatal):", unbanErr);
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "delete") {
      // Delete all client data from key tables
      const tablesToClean = [
        "nutrition_logs",
        "nutrition_targets",
        "weight_logs",
        "body_measurements",
        "body_stats",
        "workout_sessions",
        "workout_session_sets",
        "progress_photos",
        "client_goals",
        "client_notes",
        "client_tags",
        "client_program_assignments",
        "onboarding_profiles",
        "cardio_logs",
        "cardio_assignments",
        "calendar_events",
        "checkin_submissions",
        "checkin_assignments",
        "challenge_participants",
        "challenge_logs",
        "client_custom_foods",
        "client_recipes",
        "client_risk_scores",
        "client_signatures",
        "client_health_metrics",
        "client_micronutrient_overrides",
        "community_posts",
        "personal_records",
      ];

      // Delete from tables that use client_id
      for (const table of tablesToClean) {
        try {
          await adminClient.from(table).delete().eq("client_id", clientId);
        } catch (e) {
          console.error(`Error cleaning ${table}:`, e);
        }
      }

      // Delete from tables that use user_id
      const userIdTables = [
        "profiles",
        "user_roles",
        "community_user_stats",
        "community_likes",
        "community_comments",
      ];
      for (const table of userIdTables) {
        try {
          await adminClient.from(table).delete().eq("user_id", clientId);
        } catch (e) {
          console.error(`Error cleaning ${table}:`, e);
        }
      }

      // Delete message threads and messages
      const { data: threads } = await adminClient
        .from("message_threads")
        .select("id")
        .eq("client_id", clientId);
      if (threads?.length) {
        const threadIds = threads.map((t) => t.id);
        await adminClient.from("thread_messages").delete().in("thread_id", threadIds);
        await adminClient.from("message_threads").delete().eq("client_id", clientId);
      }

      // Delete coach_clients record
      await adminClient.from("coach_clients").delete().eq("client_id", clientId);

      // Delete auth user
      const { error: deleteAuthErr } = await adminClient.auth.admin.deleteUser(clientId);
      if (deleteAuthErr) {
        console.error("Delete auth user error:", deleteAuthErr);
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("manage-client-status error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
