import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Return the client's current local hour (0-23) given their IANA timezone */
function getClientLocalHour(tz: string): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
    });
    return parseInt(formatter.format(new Date()), 10);
  } catch {
    return new Date().getUTCHours();
  }
}

/** Return yesterday's date string (YYYY-MM-DD) in the client's timezone */
function getYesterdayLocal(tz: string): string {
  try {
    const yesterday = new Date(Date.now() - 86400000);
    const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return formatter.format(yesterday);
  } catch {
    const yesterday = new Date(Date.now() - 86400000);
    return yesterday.toISOString().split("T")[0];
  }
}

/** Get Monday 00:00 PST of current week as YYYY-MM-DD */
function getCurrentWeekMondayPST(): string {
  const now = new Date();
  const pstFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const pstDateStr = pstFormatter.format(now);
  const pstDate = new Date(pstDateStr + "T00:00:00");
  const day = pstDate.getDay(); // 0=Sun
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(pstDate);
  monday.setDate(monday.getDate() + diffToMonday);
  return monday.toISOString().split("T")[0];
}

/** Get today's date in PST */
function getTodayPST(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
  });
  return formatter.format(now);
}

/** Get current day of week in PST (0=Sun, 1=Mon, ... 6=Sat) */
function getDayOfWeekPST(): number {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
  });
  const dayStr = formatter.format(now);
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return map[dayStr] ?? 0;
}

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

      // Fetch client timezones
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("user_id, full_name, timezone")
        .in("user_id", clientIds);

      const profileMap = new Map(
        (profileRows || []).map((p: any) => [p.user_id, p])
      );

      let eligibleClients: string[] = [];

      switch (trigger.trigger_type) {
        case "missed_workout": {
          for (const cid of clientIds) {
            const profile = profileMap.get(cid);
            const tz = profile?.timezone || "America/Los_Angeles";
            const localHour = getClientLocalHour(tz);
            if (localHour !== 5) continue;

            const yesterday = getYesterdayLocal(tz);

            // Check scheduled workouts — coach schedules via target_client_id OR client's own
            const { data: scheduledWorkouts } = await supabase
              .from("calendar_events")
              .select("id")
              .or(`user_id.eq.${cid},target_client_id.eq.${cid}`)
              .eq("event_type", "workout")
              .eq("event_date", yesterday)
              .limit(1);

            if (!scheduledWorkouts || scheduledWorkouts.length === 0) continue;

            // Check completion via sessions
            const { data: sessions } = await supabase
              .from("workout_sessions")
              .select("id")
              .eq("client_id", cid)
              .eq("session_date", yesterday)
              .eq("status", "completed")
              .limit(1);

            // Also check calendar completion flag
            const { data: completedEvents } = await supabase
              .from("calendar_events")
              .select("id")
              .or(`user_id.eq.${cid},target_client_id.eq.${cid}`)
              .eq("event_type", "workout")
              .eq("event_date", yesterday)
              .eq("is_completed", true)
              .limit(1);

            if (
              (!sessions || sessions.length === 0) &&
              (!completedEvents || completedEvents.length === 0)
            ) {
              eligibleClients.push(cid);
            }
          }
          break;
        }

        case "missed_checkin": {
          // Calendar-only: fire ONLY if a check-in calendar event was scheduled
          // yesterday and was NOT completed, AND no submission exists for that day.
          for (const cid of clientIds) {
            const profile = profileMap.get(cid);
            const tz = profile?.timezone || "America/Los_Angeles";
            const localHour = getClientLocalHour(tz);

            // Only fire at 5 AM local time (5:00-5:59 window)
            if (localHour !== 5) continue;

            const yesterday = getYesterdayLocal(tz);

            // Was there a check-in calendar event yesterday?
            const { data: yesterdayCheckinEvents } = await supabase
              .from("calendar_events")
              .select("id, is_completed")
              .or(`user_id.eq.${cid},target_client_id.eq.${cid}`)
              .eq("event_type", "checkin")
              .eq("event_date", yesterday)
              .limit(1);

            // No scheduled check-in yesterday → skip entirely
            if (!yesterdayCheckinEvents || yesterdayCheckinEvents.length === 0) continue;

            // Already completed via calendar flag → skip
            if (yesterdayCheckinEvents.some((e: any) => e.is_completed)) continue;

            // Check if client submitted a check-in around yesterday
            const { data: recentSubmission } = await supabase
              .from("checkin_submissions")
              .select("id")
              .eq("client_id", cid)
              .gte("submitted_at", `${yesterday}T00:00:00Z`)
              .not("submitted_at", "is", null)
              .limit(1);

            if (!recentSubmission || recentSubmission.length === 0) {
              eligibleClients.push(cid);
            }
          }
          break;
        }

        case "inactivity_7d": {
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

      // Dedup: don't send to clients we've already messaged today for this trigger
      const today = getTodayPST();
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

      // Also insert into message_threads/thread_messages for real chat delivery
      for (const clientId of toSend) {
        const profile = profileMap.get(clientId);
        const name = profile?.full_name || "there";
        const content = template.content.replace(/\{name\}/g, name);

        // Log to auto_message_logs
        await supabase.from("auto_message_logs").insert({
          trigger_id: trigger.id,
          template_id: trigger.template_id,
          coach_id: trigger.coach_id,
          client_id: clientId,
          message_content: content,
          trigger_reason: trigger.trigger_type,
        });

        // Also deliver as a real message in their thread
        const { data: existingThread } = await supabase
          .from("message_threads")
          .select("id")
          .eq("coach_id", trigger.coach_id)
          .eq("client_id", clientId)
          .limit(1)
          .maybeSingle();

        let threadId = existingThread?.id;

        if (!threadId) {
          const { data: newThread } = await supabase
            .from("message_threads")
            .insert({
              coach_id: trigger.coach_id,
              client_id: clientId,
            })
            .select("id")
            .single();
          threadId = newThread?.id;
        }

        if (threadId) {
          await supabase.from("thread_messages").insert({
            thread_id: threadId,
            sender_id: trigger.coach_id,
            content: content,
          });

          // Send push notification for missed_checkin triggers
          if (trigger.trigger_type === "missed_checkin" || trigger.trigger_type === "missed_workout") {
            const notifType = trigger.trigger_type === "missed_checkin" ? "checkin" : "message";
            try {
              await supabase.functions.invoke("send-push-notification", {
                body: {
                  user_id: clientId,
                  title: trigger.trigger_type === "missed_checkin" ? "Check-In Reminder" : "Workout Reminder",
                  body: content.length > 100 ? content.slice(0, 97) + "..." : content,
                  notification_type: notifType,
                  data: { route: trigger.trigger_type === "missed_checkin" ? "/dashboard" : "/training" },
                },
              });
            } catch (pushErr) {
              console.error(`[Push] Failed for ${clientId}:`, pushErr);
            }
          }
        }

        totalSent++;
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
