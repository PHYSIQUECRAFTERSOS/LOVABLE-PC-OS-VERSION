/**
 * Sync Activity Log — in-memory ring buffer + localStorage persistence.
 *
 * Captures every HealthKit sync phase (success / failure / timeout / skipped)
 * with raw error detail. Read by the hidden Sync Activity Log debug screen
 * (tap version 5x on Connected Devices).
 *
 * Rules:
 *  - logSyncEvent MUST NEVER throw — wrapped in try/catch.
 *  - Never block sync flow; purely observational.
 */

export type SyncTrigger =
  | "startup"
  | "resume"
  | "manual"
  | "interval"
  | "connect";

export type SyncPhase =
  | "isAvailable"
  | "requestAuth"
  | "querySteps"
  | "queryWeight"
  | "querySleep"
  | "queryActiveEnergy"
  | "queryDistance"
  | "overall";

export type SyncStatus = "success" | "failure" | "timeout" | "skipped";

export interface SyncLogEntry {
  timestamp: string;        // ISO, with local TZ offset
  trigger: SyncTrigger;
  phase: SyncPhase;
  status: SyncStatus;
  durationMs: number;
  detail: string;
  platform: string;
  isNative: boolean;
}

const STORAGE_KEY = "pc_sync_activity_log_v1";
const MAX_ENTRIES = 100;

let buffer: SyncLogEntry[] = [];
let loaded = false;

function loadFromStorage() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        buffer = parsed.slice(-MAX_ENTRIES);
      }
    }
  } catch {
    /* ignore */
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(buffer));
  } catch {
    /* ignore quota / private mode */
  }
}

function localIsoNow(): string {
  try {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const tzMin = -d.getTimezoneOffset();
    const sign = tzMin >= 0 ? "+" : "-";
    const abs = Math.abs(tzMin);
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
      `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
    );
  } catch {
    return new Date().toISOString();
  }
}

export function logSyncEvent(
  partial: Omit<SyncLogEntry, "timestamp" | "isNative"> & {
    isNative?: boolean;
  }
): void {
  try {
    loadFromStorage();
    const entry: SyncLogEntry = {
      timestamp: localIsoNow(),
      isNative: partial.isNative ?? false,
      ...partial,
    };
    buffer.push(entry);
    if (buffer.length > MAX_ENTRIES) {
      buffer = buffer.slice(-MAX_ENTRIES);
    }
    persist();
  } catch {
    /* logging must never throw */
  }
}

export function getSyncLog(): SyncLogEntry[] {
  loadFromStorage();
  return [...buffer];
}

export function exportSyncLog(): string {
  loadFromStorage();
  return JSON.stringify(buffer, null, 2);
}

export function clearSyncLog(): void {
  buffer = [];
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function getLastOverallSuccess(): SyncLogEntry | null {
  loadFromStorage();
  for (let i = buffer.length - 1; i >= 0; i--) {
    const e = buffer[i];
    if (e.phase === "overall" && e.status === "success") return e;
  }
  return null;
}

/**
 * Dev-only invariant assertion (Invariant #1 — start-of-day).
 * A YYYY-MM-DD date string IS local midnight by definition; we additionally
 * verify it has not been mangled into a Date/ISO with a non-zero time.
 *
 * Throws in dev, logs in prod (so it surfaces in the sync log instead of
 * crashing real users).
 */
export function assertLocalMidnightDateString(
  date: string,
  context: string
): void {
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(date);
  if (ok) return;
  const msg =
    `[HEALTH_SYNC_INVARIANT VIOLATION] ${context}: expected start-of-local-day ` +
    `YYYY-MM-DD, got "${date}". See HEALTH_SYNC_INVARIANTS.md (Invariant #1).`;
  if (import.meta.env?.DEV) {
    throw new Error(msg);
  }
  // Prod: surface in sync log instead of crashing
  logSyncEvent({
    trigger: "manual",
    phase: "overall",
    status: "failure",
    durationMs: 0,
    detail: msg,
    platform: "unknown",
  });
}
