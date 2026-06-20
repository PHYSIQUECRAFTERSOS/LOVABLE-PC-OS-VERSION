import { useState, useEffect, useRef, useCallback } from "react";
import { SkipForward, Check } from "lucide-react";
import { App, type AppState } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { createTimerWorker } from "@/services/timerWorker";
import {
  preloadRestTimerAudio,
  playCompletionSound,
  scheduleBackgroundCompletion,
  cancelBackgroundCompletion,
  ensureNotificationPermission,
} from "@/utils/restTimerAudio";

interface InlineRestTimerProps {
  seconds: number;
  onComplete: () => void;
  onSkip: () => void;
}

/**
 * Split-by-app-state rest timer end cue.
 *
 *   FOREGROUND (app active): NativeAudio plays the bundled mp3 through
 *     AVAudioSession (.playback + .mixWithOthers via AudioMixPlugin) so
 *     Spotify/Apple Music are not interrupted. NO local notification is
 *     scheduled — no banner, no OS sound, no audio session change.
 *
 *   BACKGROUND / LOCKED: a LocalNotification is scheduled IN ADVANCE for
 *     the timer's exact `endTime`, carrying the bundled sound. This is the
 *     ONLY mechanism that fires while the JS runtime is suspended.
 *     Scheduled the moment the app backgrounds (not on timer start),
 *     cancelled the instant the app foregrounds.
 *
 * Transitions are debounced via `notifIdRef` + `hasPlayedRef` so there is
 * no double-fire (foreground audio + notification).
 */
let REST_TIMER_RUN_SEQ = 0;

const InlineRestTimer = ({ seconds: initialSeconds, onComplete, onSkip }: InlineRestTimerProps) => {
  const [timeRemaining, setTimeRemaining] = useState(initialSeconds);
  const workerRef = useRef<Worker | null>(null);
  const hasPlayedRef = useRef(false);
  const notifIdRef = useRef<number | null>(null);
  const endTimeRef = useRef<number>(0);
  const runIdRef = useRef<number>(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Preload bundled MP3 + warm AVAudioSession on mount (mount = user gesture)
  // Also request notification permission once so the background path works
  // the first time the user backgrounds during a rest.
  useEffect(() => {
    void preloadRestTimerAudio();
    if (Capacitor.isNativePlatform()) {
      void ensureNotificationPermission();
    }
  }, []);

  useEffect(() => {
    setTimeRemaining(initialSeconds);
    hasPlayedRef.current = false;

    const endTime = Date.now() + initialSeconds * 1000;
    endTimeRef.current = endTime;
    const runId = ++REST_TIMER_RUN_SEQ;
    runIdRef.current = runId;

    const worker = createTimerWorker();
    workerRef.current = worker;

    const cancelPendingNotif = () => {
      const pendingId = notifIdRef.current;
      notifIdRef.current = null;
      if (pendingId != null) void cancelBackgroundCompletion(pendingId);
    };

    const handleDone = () => {
      if (hasPlayedRef.current) return;
      // Hard guard: only fire when wall-clock has actually reached endTime.
      // Catches any stale `done` produced by a previous run that somehow
      // raced past the runId check.
      if (Date.now() < endTimeRef.current - 100) return;
      hasPlayedRef.current = true;
      setTimeRemaining(0);

      cancelPendingNotif();

      void playCompletionSound();

      if ("vibrate" in navigator) {
        try { navigator.vibrate([200, 100, 200]); } catch { /* ignore */ }
      }

      setTimeout(() => onCompleteRef.current(), 800);
    };

    worker.onmessage = (e) => {
      const msg = e.data;
      // Ignore messages from any previous timer run.
      if (msg.runId !== runId) return;
      if (msg.type === "tick") setTimeRemaining(msg.remaining);
      if (msg.type === "done") handleDone();
    };

    worker.postMessage({ type: "start", endTime, runId });

    // ── App-state branching ──────────────────────────────────────────────
    let appStateHandle: { remove: () => Promise<void> } | null = null;

    const handleAppState = (state: AppState) => {
      if (hasPlayedRef.current) return;
      if (state.isActive) {
        cancelPendingNotif();
      } else {
        if (notifIdRef.current != null) return;
        void scheduleBackgroundCompletion(endTimeRef.current).then((id) => {
          if (hasPlayedRef.current || runIdRef.current !== runId) {
            if (id != null) void cancelBackgroundCompletion(id);
            return;
          }
          notifIdRef.current = id;
        });
      }
    };

    if (Capacitor.isNativePlatform()) {
      void App.addListener("appStateChange", handleAppState).then((h) => {
        appStateHandle = h;
      });
    }

    // Web/PWA: reconcile on tab visibility return.
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        const remainingMs = Math.max(0, endTimeRef.current - Date.now());
        if (remainingMs <= 0) {
          worker.postMessage({ type: "stop" });
          handleDone();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      worker.postMessage({ type: "stop" });
      worker.terminate();
      workerRef.current = null;
      document.removeEventListener("visibilitychange", handleVisibility);
      if (appStateHandle) {
        void appStateHandle.remove();
        appStateHandle = null;
      }
      if (!hasPlayedRef.current) cancelPendingNotif();
    };
  }, [initialSeconds]);



  const handleSkip = useCallback(() => {
    hasPlayedRef.current = true; // prevent any pending fire
    if (workerRef.current) {
      workerRef.current.postMessage({ type: "stop" });
      workerRef.current.terminate();
      workerRef.current = null;
    }
    const pendingId = notifIdRef.current;
    notifIdRef.current = null;
    if (pendingId != null) void cancelBackgroundCompletion(pendingId);
    onSkip();
  }, [onSkip]);

  const mins = Math.floor(timeRemaining / 60);
  const secs = timeRemaining % 60;
  const progress = initialSeconds > 0 ? ((initialSeconds - timeRemaining) / initialSeconds) * 100 : 100;
  const isComplete = timeRemaining <= 0;

  return (
    <div className={`relative w-full h-11 rounded-lg border-l-4 flex items-center px-3 transition-colors ${
      isComplete ? "border-l-primary bg-primary/20 animate-pulse" : "border-l-primary bg-primary/15"
    }`}>
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-primary/20 rounded-t-lg overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-500 ease-linear"
          style={{ width: `${100 - progress}%` }}
        />
      </div>

      <div className="flex items-center gap-2 flex-1">
        {isComplete ? (
          <Check className="h-4 w-4 text-primary" />
        ) : (
          <span className="text-sm">⏱</span>
        )}
        <span className={`text-sm font-bold tabular-nums ${isComplete ? "text-primary" : "text-foreground"}`}>
          {isComplete ? "Next set ready! 💪" : `${mins}:${secs.toString().padStart(2, "0")}`}
        </span>
      </div>

      <button
        onClick={handleSkip}
        className="h-7 px-2.5 rounded-full bg-background/80 border border-border text-xs font-medium flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
      >
        <SkipForward className="h-3 w-3" />
      </button>
    </div>
  );
};

export default InlineRestTimer;
