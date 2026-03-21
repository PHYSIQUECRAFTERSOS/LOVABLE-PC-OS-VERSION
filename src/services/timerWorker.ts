/**
 * Inline Web Worker for rest timer ticks.
 * 
 * Web Workers are NOT throttled by iOS Safari like the main thread,
 * so this gives reliable ~250ms ticks even when the screen is off or
 * the user switches apps.
 *
 * Usage:
 *   import { createTimerWorker } from "@/services/timerWorker";
 *   const worker = createTimerWorker();
 *   worker.postMessage({ type: "start", endTime: Date.now() + 90000 });
 *   worker.onmessage = (e) => { /* e.data = { type: "tick", remaining: 87 } or { type: "done" } *\/ };
 *   worker.postMessage({ type: "stop" });
 */

const WORKER_CODE = `
let intervalId = null;
let endTime = 0;

self.onmessage = function(e) {
  const msg = e.data;
  
  if (msg.type === "start") {
    endTime = msg.endTime;
    if (intervalId) clearInterval(intervalId);
    
    // Immediately send first tick
    tick();
    
    // Tick every 250ms for responsive UI
    intervalId = setInterval(tick, 250);
  }
  
  if (msg.type === "stop") {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }
};

function tick() {
  const now = Date.now();
  const remainingMs = Math.max(0, endTime - now);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  
  if (remainingMs <= 0) {
    self.postMessage({ type: "done", remaining: 0, remainingMs: 0 });
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  } else {
    self.postMessage({ type: "tick", remaining: remainingSeconds, remainingMs: remainingMs });
  }
}
`;

export function createTimerWorker(): Worker {
  const blob = new Blob([WORKER_CODE], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);
  
  // Clean up blob URL after worker is created
  // (worker keeps its own reference to the script)
  URL.revokeObjectURL(url);
  
  return worker;
}
