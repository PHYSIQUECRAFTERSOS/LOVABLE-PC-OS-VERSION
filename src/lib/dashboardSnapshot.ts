/**
 * Dashboard snapshot: a tiny per-user, per-local-date blob in localStorage that
 * lets the client dashboard paint last-known values INSTANTLY on cold boot
 * (after iOS evicts the webview and CacheBuster clears web caches).
 *
 * CacheBuster clears WKWebsiteDataStore caches (HTTP/fetch/SW) but NOT
 * localStorage — that's how the Supabase auth session survives too, so we
 * ride the same surviving container.
 *
 * Display cache only. Never used for auth. Never authoritative once fresh
 * data arrives. On ANY mismatch (version / user / date / shape / age) we
 * return null so the card falls back to its normal skeleton + fetch path.
 *
 * BUMP SNAPSHOT_VERSION in the same commit if any slice shape changes.
 */

import { getLocalDateString } from "@/utils/localDate";

export const SNAPSHOT_VERSION = 1;
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 h
const KEY_PREFIX = "pc_dashboard_snapshot";

// ── Slice shapes ─────────────────────────────────────────────────────────────

export interface MacrosSlice {
  totals: { calories: number; protein: number; carbs: number; fat: number };
  targets: { calories: number; protein: number; carbs: number; fat: number };
  dayType: "training_day" | "rest_day";
}

export interface TodayActionsSlice {
  items: Array<{
    id: string;
    title: string;
    type: string;
    completed: boolean;
    description?: string | null;
    linkedWorkoutId?: string | null;
    isAccessory?: boolean;
  }>;
}

export interface ProgressMomentumSlice {
  weightChange: number | null;
  currentWeight: number | null;
  workoutCompletion: number;
  stepAvg: number;
}

export interface ProgressWidgetSlice {
  dbSteps: number | null;
  dbDistance: number | null;
  dbStepGoal: number | null;
  stepsSpark: Array<{ value: number }>;
  distanceSpark: Array<{ value: number }>;
  todayCals: number;
  calSpark: Array<{ value: number }>;
  photoUrls: string[];
}

export interface SnapshotSlices {
  macros?: MacrosSlice;
  todayActions?: TodayActionsSlice;
  progressMomentum?: ProgressMomentumSlice;
  progressWidget?: ProgressWidgetSlice;
}

export type SliceKey = keyof SnapshotSlices;

interface SnapshotEnvelope {
  version: number;
  userId: string;
  localDate: string;
  writtenAt: number;
  slices: SnapshotSlices;
}

// ── Key / storage helpers ────────────────────────────────────────────────────

function keyFor(userId: string, localDate: string) {
  return `${KEY_PREFIX}:v${SNAPSHOT_VERSION}:${userId}:${localDate}`;
}

function safeGet(key: string): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  } catch {
    /* quota or private-mode — ignore */
  }
}

// ── Validation ───────────────────────────────────────────────────────────────

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isNumOrNull = (v: unknown) => v === null || isNum(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isBool = (v: unknown): v is boolean => typeof v === "boolean";

function validMacros(s: any): s is MacrosSlice {
  return (
    s && typeof s === "object" &&
    s.totals && isNum(s.totals.calories) && isNum(s.totals.protein) && isNum(s.totals.carbs) && isNum(s.totals.fat) &&
    s.targets && isNum(s.targets.calories) && isNum(s.targets.protein) && isNum(s.targets.carbs) && isNum(s.targets.fat) &&
    (s.dayType === "training_day" || s.dayType === "rest_day")
  );
}

function validTodayActions(s: any): s is TodayActionsSlice {
  if (!s || !Array.isArray(s.items)) return false;
  return s.items.every(
    (i: any) => i && isStr(i.id) && isStr(i.title) && isStr(i.type) && isBool(i.completed)
  );
}

function validProgressMomentum(s: any): s is ProgressMomentumSlice {
  return (
    s && typeof s === "object" &&
    isNumOrNull(s.weightChange) && isNumOrNull(s.currentWeight) &&
    isNum(s.workoutCompletion) && isNum(s.stepAvg)
  );
}

function validSpark(a: any): a is Array<{ value: number }> {
  return Array.isArray(a) && a.every((p) => p && isNum(p.value));
}

function validProgressWidget(s: any): s is ProgressWidgetSlice {
  return (
    s && typeof s === "object" &&
    isNumOrNull(s.dbSteps) && isNumOrNull(s.dbDistance) && isNumOrNull(s.dbStepGoal) &&
    validSpark(s.stepsSpark) && validSpark(s.distanceSpark) &&
    isNum(s.todayCals) && validSpark(s.calSpark) &&
    Array.isArray(s.photoUrls) && s.photoUrls.every(isStr)
  );
}

const VALIDATORS: Record<SliceKey, (s: any) => boolean> = {
  macros: validMacros,
  todayActions: validTodayActions,
  progressMomentum: validProgressMomentum,
  progressWidget: validProgressWidget,
};

// ── Envelope read/write ──────────────────────────────────────────────────────

function readEnvelope(userId: string, localDate: string): SnapshotEnvelope | null {
  const raw = safeGet(keyFor(userId, localDate));
  if (!raw) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  if (parsed.version !== SNAPSHOT_VERSION) return null;
  if (parsed.userId !== userId) return null;
  if (parsed.localDate !== localDate) return null;
  if (!isNum(parsed.writtenAt) || Date.now() - parsed.writtenAt > MAX_AGE_MS) return null;
  if (!parsed.slices || typeof parsed.slices !== "object") return null;
  return parsed as SnapshotEnvelope;
}

/**
 * Read one slice for the current user + today's local date.
 * Returns null on any version / user / date / shape / age mismatch.
 */
export function readSnapshotSlice<K extends SliceKey>(
  userId: string | undefined | null,
  slice: K,
  localDate: string = getLocalDateString(),
): SnapshotSlices[K] | null {
  if (!userId) return null;
  const env = readEnvelope(userId, localDate);
  if (!env) return null;
  const value = env.slices[slice];
  if (!value) return null;
  return VALIDATORS[slice](value) ? (value as SnapshotSlices[K]) : null;
}

/**
 * Merge a slice into the snapshot and persist. Safe to call on every
 * successful fetch — the payload is tiny and single-user.
 */
export function writeSnapshotSlice<K extends SliceKey>(
  userId: string | undefined | null,
  slice: K,
  value: SnapshotSlices[K],
  localDate: string = getLocalDateString(),
) {
  if (!userId || !value) return;
  if (!VALIDATORS[slice](value)) return; // never persist malformed data
  const existing = readEnvelope(userId, localDate);
  const next: SnapshotEnvelope = {
    version: SNAPSHOT_VERSION,
    userId,
    localDate,
    writtenAt: Date.now(),
    slices: { ...(existing?.slices ?? {}), [slice]: value },
  };
  safeSet(keyFor(userId, localDate), JSON.stringify(next));
}
