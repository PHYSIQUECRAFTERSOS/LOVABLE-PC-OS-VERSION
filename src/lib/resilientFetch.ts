/**
 * Retry helper for transient network / backend failures.
 *
 * iOS suspends the webview while the app is backgrounded. When it resumes,
 * the first fetch often dies with "TypeError: Load failed" before the radio
 * is awake again. Postgres can also cancel a long statement
 * ("canceling statement due to statement timeout"). Both are transient and
 * succeed on a second attempt — everything else should fail fast.
 */

const RETRYABLE_PATTERNS = [
  "load failed",
  "failed to fetch",
  "network",
  "networkerror",
  "statement timeout",
  "canceling statement",
  "timeout",
  "timed out",

  "socket",
  "connection",
  "aborted",
  "504",
  "502",
  "503",
];

const TERMINAL_CODES = new Set([
  "42501", // insufficient privilege / RLS
  "PGRST116", // no rows
  "23505", // unique violation
  "22P02", // invalid input syntax
]);

export function isRetryableError(err: any): boolean {
  if (!err) return false;
  if (err.code && TERMINAL_CODES.has(String(err.code))) return false;
  // Explicit user-initiated aborts (component unmount) should not retry.
  if (err.name === "AbortError" && err.__userAbort) return false;
  const msg = `${err.message ?? ""} ${err.details ?? ""} ${err.code ?? ""}`.toLowerCase();
  if (!msg.trim()) return true; // opaque failures are usually network
  return RETRYABLE_PATTERNS.some((p) => msg.includes(p));
}

function waitForOnlineOnce(maxWaitMs: number): Promise<void> {
  if (navigator.onLine) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener("online", finish);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, maxWaitMs);
    window.addEventListener("online", finish);
  });
}

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  waitForOnline?: boolean;
  label?: string;
  /** Per-attempt hard timeout. A suspended iOS webview can leave a fetch
   *  pending forever — without this the retry ladder never runs and the UI
   *  spins indefinitely. */
  timeoutMs?: number;
}

class RequestTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = "RequestTimeoutError";
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label = "request"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new RequestTimeoutError(label, ms)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  {
    attempts = 3,
    baseDelayMs = 400,
    waitForOnline = true,
    label = "request",
    timeoutMs = 12000,
  }: RetryOptions = {},
): Promise<T> {
  let lastErr: any;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      if (waitForOnline && !navigator.onLine) {
        await waitForOnlineOnce(4000);
      }
      return await withTimeout(Promise.resolve(fn()), timeoutMs, label);
    } catch (err: any) {
      lastErr = err;
      if (attempt === attempts || !isRetryableError(err)) break;
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      console.warn(`[withRetry] ${label} attempt ${attempt} failed (${err?.message}) — retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastErr;
}

