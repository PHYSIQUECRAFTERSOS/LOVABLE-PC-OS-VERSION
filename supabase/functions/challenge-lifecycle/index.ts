import Deno from "@anthropic/sdk";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const today = new Date().toISOString().split("T")[0];

    // Transition upcoming → active
    const { data: toActivate } = await supabase
      .from("challenges")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("status", "upcoming")
      .lte("start_date", today)
      .select("id");

    // Transition active → completed
    const { data: toComplete } = await supabase
      .from("challenges")
      .select("id, xp_reward, badge_id")
      .eq("status", "active")
      .lt("end_date", today);

    let completedCount = 0;
    for (const challenge of (toComplete || [])) {
      // Mark challenge as completed
      await supabase
        .from("challenges")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", challenge.id);

      // Award XP and badges to active participants
      const { data: participants } = await supabase
        .from("challenge_participants")
        .select("*")
        .eq("challenge_id", challenge.id)
        .eq("status", "active");

      for (const p of (participants || [])) {
        // Mark participant as completed
        await supabase
          .from("challenge_participants")
          .update({ status: "completed", completed_at: new Date().toISOString(), xp_earned: challenge.xp_reward })
          .eq("id", p.id);

        // Award XP
        await supabase.from("xp_ledger").insert({
          user_id: p.user_id,
          amount: challenge.xp_reward,
          source_type: "challenge",
          source_id: challenge.id,
          description: `Challenge completed`,
        });

        // Award badge if configured
        if (challenge.badge_id) {
          await supabase.from("user_badges").upsert({
            user_id: p.user_id,
            badge_id: challenge.badge_id,
            source_challenge_id: challenge.id,
          }, { onConflict: "user_id,badge_id" });
        }

        // Recalculate total XP
        const { data: ledger } = await supabase
          .from("xp_ledger")
          .select("amount")
          .eq("user_id", p.user_id);
        const totalXP = (ledger || []).reduce((sum: number, l: any) => sum + l.amount, 0);

        const { data: tiers } = await supabase
          .from("tiers")
          .select("*")
          .order("min_xp", { ascending: false });
        const tier = (tiers || []).find((t: any) => totalXP >= t.min_xp);

        await supabase.from("user_xp_summary").upsert({
          user_id: p.user_id,
          total_xp: totalXP,
          current_tier_id: tier?.id || null,
        }, { onConflict: "user_id" });
      }
      completedCount++;
    }

    return new Response(
      JSON.stringify({
        activated: (toActivate || []).length,
        completed: completedCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
