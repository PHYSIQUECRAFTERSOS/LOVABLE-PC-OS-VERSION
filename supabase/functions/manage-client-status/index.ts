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
    const callerId = claimsData.claims.sub as string;

    // Parse body
    const body = await req.json();
    const { action, clientId } = body;
    if (!action || !clientId) {
      return new Response(JSON.stringify({ error: "Missing action or clientId" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Admin client for auth operations
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check caller role
    const { data: callerRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const isAdmin = callerRoles?.some((r: any) => r.role === "admin");
    const isCoach = callerRoles?.some((r: any) => r.role === "coach" || r.role === "admin");

    if (!isCoach) {
      return new Response(JSON.stringify({ error: "Unauthorized: coach or admin role required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Verify coach owns this client (or admin)
    const assignmentQuery = adminClient
      .from("coach_clients")
      .select("id, status, coach_id")
      .eq("client_id", clientId);

    if (!isAdmin) {
      assignmentQuery.eq("coach_id", callerId);
    }

    const { data: assignment, error: assignErr } = await assignmentQuery.maybeSingle();

    if (assignErr || !assignment) {
      return new Response(JSON.stringify({ error: "Client not found or not assigned to you" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── TRANSFER ──
    if (action === "transfer") {
      const { targetCoachId } = body;
      if (!targetCoachId) {
        return new Response(JSON.stringify({ error: "Missing targetCoachId" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Verify target is actually a coach
      const { data: targetRoles } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", targetCoachId);
      const targetIsCoach = targetRoles?.some((r: any) => r.role === "coach" || r.role === "admin");
      if (!targetIsCoach) {
        return new Response(JSON.stringify({ error: "Target user is not a coach" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const previousCoachId = assignment.coach_id;

      // Update the coach_clients assignment
      const { error: transferErr } = await adminClient
        .from("coach_clients")
        .update({
          coach_id: targetCoachId,
          transferred_from: previousCoachId,
          transferred_at: new Date().toISOString(),
        })
        .eq("id", assignment.id);
      if (transferErr) throw transferErr;

      // Transfer message threads
      await adminClient
        .from("message_threads")
        .update({ coach_id: targetCoachId })
        .eq("client_id", clientId)
        .eq("coach_id", previousCoachId);

      // Transfer client notes
      await adminClient
        .from("client_notes")
        .update({ coach_id: targetCoachId })
        .eq("client_id", clientId)
        .eq("coach_id", previousCoachId);

      // Transfer cardio assignments
      await adminClient
        .from("cardio_assignments")
        .update({ coach_id: targetCoachId })
        .eq("client_id", clientId)
        .eq("coach_id", previousCoachId);

      // Transfer checkin assignments
      await adminClient
        .from("checkin_assignments")
        .update({ coach_id: targetCoachId })
        .eq("client_id", clientId)
        .eq("coach_id", previousCoachId);

      // Transfer client goals
      // (client_goals doesn't have coach_id, so no transfer needed)

      // Transfer calendar events created by the coach for this client
      await adminClient
        .from("calendar_events")
        .update({ user_id: targetCoachId })
        .eq("target_client_id", clientId)
        .eq("user_id", previousCoachId);

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "deactivate") {
      const { error: updateErr } = await adminClient
        .from("coach_clients")
        .update({ status: "deactivated" })
        .eq("id", assignment.id);
      if (updateErr) throw updateErr;

      const { error: banErr } = await adminClient.auth.admin.updateUserById(clientId, {
        ban_duration: "876000h",
      });
      if (banErr) {
        console.error("Ban error (non-fatal):", banErr);
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "reactivate") {
      const { error: updateErr } = await adminClient
        .from("coach_clients")
        .update({ status: "active" })
        .eq("id", assignment.id);
      if (updateErr) throw updateErr;

      const { error: unbanErr } = await adminClient.auth.admin.updateUserById(clientId, {
        ban_duration: "none",
      });
      if (unbanErr) {
        console.error("Unban error (non-fatal):", unbanErr);
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "delete") {
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

      for (const table of tablesToClean) {
        try {
          await adminClient.from(table).delete().eq("client_id", clientId);
        } catch (e) {
          console.error(`Error cleaning ${table}:`, e);
        }
      }

      try {
        await adminClient.from("client_program_tracker").delete().eq("client_id", clientId);
      } catch (e) {
        console.error("Error cleaning client_program_tracker:", e);
      }

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

      const { data: threads } = await adminClient
        .from("message_threads")
        .select("id")
        .eq("client_id", clientId);
      if (threads?.length) {
        const threadIds = threads.map((t) => t.id);
        await adminClient.from("thread_messages").delete().in("thread_id", threadIds);
        await adminClient.from("message_threads").delete().eq("client_id", clientId);
      }

      await adminClient.from("coach_clients").delete().eq("client_id", clientId);

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
