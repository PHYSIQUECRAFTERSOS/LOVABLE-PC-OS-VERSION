import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Google Fit REST API was officially shut down by Google on June 30, 2025.
 * The replacement on Android is Health Connect, which is read natively
 * from inside the Android app via the HealthConnectPlugin (see
 * src/hooks/useHealthSync.ts + src/plugins/HealthConnectPlugin.ts).
 *
 * This endpoint is kept so any old buttons / cached UI tap targets fail
 * with a clear human-readable message instead of an opaque OAuth error.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  return new Response(
    JSON.stringify({
      error:
        "Google Fit was retired by Google on June 30, 2025. On Android, install the Physique Crafters app from the Play Store and tap Connect on Health Connect in Settings → Connected Devices.",
      retired: true,
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
