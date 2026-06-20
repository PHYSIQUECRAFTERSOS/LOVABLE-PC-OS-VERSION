/**
 * Inline Web Worker for rest timer ticks.
 *
 * Web Workers are NOT throttled by iOS Safari like the main thread,
 * so this gives reliable ~250ms ticks even when the screen is off or
 * the user switches apps.
 *
 * Every "start" carries a unique `runId`. Tick/done messages echo that
 * runId back so the main thread can ignore stale messages from a
 * previous timer run (which was the root cause of the rest-timer cue
 * firing at random remaining-times like 30s or 50s).
 *
 * Usage:
 *   const worker = createTimerWorker();
 *   worker.postMessage({ type: "start", endTime: Date.now() + 90000, runId: 1 });
 *   worker.onmessage = (e) => { ... };
 *   worker.postMessage({ type: "stop" });
 */

const WORKER_CODE = `
let intervalId = null;
let endTime = 0;
let runId = 0;
let doneSent = false;

self.onmessage = function(e) {
  const msg = e.data;

  if (msg.type === "start") {
    endTime = msg.endTime;
    runId = msg.runId || 0;
    doneSent = false;
    if (intervalId) clearInterval(intervalId);
    tick();
    intervalId = setInterval(tick, 250);
  }

  if (msg.type === "stop") {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    doneSent = true;
  }
};

function tick() {
  const now = Date.now();
  const remainingMs = Math.max(0, endTime - now);
  const remainingSeconds = Math.ceil(remainingMs / 1000);

  if (remainingMs <= 0) {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (doneSent) return;
    doneSent = true;
    self.postMessage({ type: "done", runId: runId, remaining: 0, remainingMs: 0 });
  } else {
    self.postMessage({ type: "tick", runId: runId, remaining: remainingSeconds, remainingMs: remainingMs });
  }
}
`;

export function createTimerWorker(): Worker {
  const blob = new Blob([WORKER_CODE], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);
  URL.revokeObjectURL(url);
  return worker;
}
