/**
 * Short-lived, per-client cache for the client-profile header payload
 * (profile, tags, active program, coach_clients settings).
 *
 * Same stale-while-revalidate contract as `useClientProgram`: a cached entry
 * paints instantly, and the caller always revalidates in the background.
 * Persisted to sessionStorage so a reload / iOS webview eviction still paints
 * the header immediately.
 */

export interface ClientHeaderData {
  profile: {
    user_id: string;
    full_name: string;
    avatar_url: string | null;
    phone: string | null;
  } | null;
  tags: string[];
  programName: string | null;
  programType: string | null;
  isPending: boolean;
  lookaheadDays: number;
}

const TTL_MS = 5 * 60 * 1000;
const KEY_PREFIX = "pc.clientHeader.";

const memory = new Map<string, { data: ClientHeaderData; ts: number }>();

export function getClientHeader(clientId: string | undefined): ClientHeaderData | null {
  if (!clientId) return null;

  const hit = memory.get(clientId);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.data;

  try {
    const raw = sessionStorage.getItem(KEY_PREFIX + clientId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: ClientHeaderData; ts: number };
    if (!parsed?.data || Date.now() - parsed.ts >= TTL_MS) return null;
    memory.set(clientId, parsed);
    return parsed.data;
  } catch {
    return null;
  }
}

export function setClientHeader(clientId: string | undefined, data: ClientHeaderData): void {
  if (!clientId) return;
  const entry = { data, ts: Date.now() };
  memory.set(clientId, entry);
  try {
    sessionStorage.setItem(KEY_PREFIX + clientId, JSON.stringify(entry));
  } catch {
    /* quota / private mode — memory cache still applies */
  }
}

export function invalidateClientHeader(clientId?: string): void {
  if (clientId) {
    memory.delete(clientId);
    try { sessionStorage.removeItem(KEY_PREFIX + clientId); } catch { /* ignore */ }
    return;
  }
  memory.clear();
}
