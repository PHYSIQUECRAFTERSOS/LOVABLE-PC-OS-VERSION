import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get all active triggers
    const { data: triggers, error: trigErr } = await supabase
      .from("auto_message_triggers")
      .select("*, auto_message_templates(content, name)")
      .eq("is_active", true);

    if (trigErr) throw trigErr;
    if (!triggers || triggers.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalSent = 0;

    for (const trigger of triggers) {
      const template = trigger.auto_message_templates;
      if (!template) continue;

      // Get target clients
      let clientIds: string[] = [];

      if (trigger.target_type === "individual" && trigger.target_client_id) {
        clientIds = [trigger.target_client_id];
      } else if (trigger.target_type === "tag_group" && trigger.target_tag) {
        const { data: tagged } = await supabase
          .from("client_tags")
          .select("client_id")
          .eq("coach_id", trigger.coach_id)
          .eq("tag", trigger.target_tag);
        clientIds = tagged?.map((t: any) => t.client_id) || [];
      } else {
        // all_clients
        const { data: cc } = await supabase
          .from("coach_clients")
          .select("client_id")
          .eq("coach_id", trigger.coach_id)
          .eq("status", "active");
        clientIds = cc?.map((c: any) => c.client_id) || [];
      }

      if (clientIds.length === 0) continue;

      // Evaluate trigger conditions
      let eligibleClients: string[] = [];

      switch (trigger.trigger_type) {
        case "missed_workout": {
          // Clients with no workout session in last 2 days
          const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
          for (const cid of clientIds) {
            const { data: sessions } = await supabase
              .from("workout_sessions")
              .select("id")
              .eq("client_id", cid)
              .gte("created_at", twoDaysAgo)
              .limit(1);
            if (!sessions || sessions.length === 0) {
              eligibleClients.push(cid);
            }
          }
          break;
        }

        case "missed_checkin": {
          // Clients with no weekly checkin in last 8 days
          const eightDaysAgo = new Date(Date.now() - 8 * 86400000)
            .toISOString()
            .split("T")[0];
          for (const cid of clientIds) {
            const { data: checkins } = await supabase
              .from("weekly_checkins")
              .select("id")
              .eq("client_id", cid)
              .gte("week_date", eightDaysAgo)
              .limit(1);
            if (!checkins || checkins.length === 0) {
              eligibleClients.push(cid);
            }
          }
          break;
        }

        case "inactivity_7d": {
          // No workout, no nutrition log, no checkin in 7 days
          const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
          for (const cid of clientIds) {
            const { data: ws } = await supabase
              .from("workout_sessions")
              .select("id")
              .eq("client_id", cid)
              .gte("created_at", sevenDaysAgo)
              .limit(1);
            const { data: nl } = await supabase
              .from("nutrition_logs")
              .select("id")
              .eq("client_id", cid)
              .gte("logged_at", sevenDaysAgo.split("T")[0])
              .limit(1);
            if (
              (!ws || ws.length === 0) &&
              (!nl || nl.length === 0)
            ) {
              eligibleClients.push(cid);
            }
          }
          break;
        }

        case "goal_milestone": {
          // Clients who hit a weight goal within 1kg
          for (const cid of clientIds) {
            const { data: goal } = await supabase
              .from("client_goals")
              .select("target_weight")
              .eq("client_id", cid)
              .limit(1)
              .single();
            if (!goal?.target_weight) continue;

            const { data: weight } = await supabase
              .from("weight_logs")
              .select("weight")
              .eq("client_id", cid)
              .order("logged_at", { ascending: false })
              .limit(1)
              .single();
            if (weight && Math.abs(weight.weight - goal.target_weight) <= 1) {
              eligibleClients.push(cid);
            }
          }
          break;
        }

        case "recurring":
        case "broadcast": {
          eligibleClients = clientIds;
          break;
        }
      }

      if (eligibleClients.length === 0) continue;

      // Check we haven't already sent to these clients today for this trigger
      const today = new Date().toISOString().split("T")[0];
      const { data: alreadySent } = await supabase
        .from("auto_message_logs")
        .select("client_id")
        .eq("trigger_id", trigger.id)
        .gte("sent_at", today + "T00:00:00Z");

      const alreadySentIds = new Set(
        alreadySent?.map((l: any) => l.client_id) || []
      );
      const toSend = eligibleClients.filter((c) => !alreadySentIds.has(c));

      if (toSend.length === 0) continue;

      // Get client names for personalization
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", toSend);

      const logs = toSend.map((clientId) => {
        const name =
          profiles?.find((p: any) => p.user_id === clientId)?.full_name ||
          "there";
        const content = template.content.replace(/\{name\}/g, name);
        return {
          trigger_id: trigger.id,
          template_id: trigger.template_id,
          coach_id: trigger.coach_id,
          client_id: clientId,
          message_content: content,
          trigger_reason: trigger.trigger_type,
        };
      });

      const { error: logErr } = await supabase
        .from("auto_message_logs")
        .insert(logs);
      if (logErr) {
        console.error("Failed to insert logs:", logErr);
      } else {
        totalSent += logs.length;
      }

      // Update last evaluated
      await supabase
        .from("auto_message_triggers")
        .update({ last_evaluated_at: new Date().toISOString() })
        .eq("id", trigger.id);
    }

    return new Response(
      JSON.stringify({ processed: triggers.length, sent: totalSent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
