import { supabase } from "@/integrations/supabase/client";

export interface ClientContext {
  clientId: string;
  clientName: string;
  coachName: string | null;
}

/** Resolve client + assigned-coach names. RLS-safe — falls back gracefully. */
export async function loadClientContext(clientId: string): Promise<ClientContext> {
  const [{ data: clientProfile }, { data: coachLink }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", clientId).maybeSingle(),
    supabase.from("coach_clients").select("coach_id").eq("client_id", clientId).eq("status", "active").maybeSingle(),
  ]);
  let coachName: string | null = null;
  if (coachLink?.coach_id) {
    const { data: coachProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", coachLink.coach_id)
      .maybeSingle();
    coachName = coachProfile?.full_name || null;
  }
  return {
    clientId,
    clientName: clientProfile?.full_name || "Client",
    coachName,
  };
}
