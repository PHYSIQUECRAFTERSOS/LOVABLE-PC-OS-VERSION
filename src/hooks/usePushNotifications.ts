import { useEffect, useRef } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function usePushNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const toastRef = useRef(toast);
  const registeredRef = useRef(false);
  const savedTokenRef = useRef<string | null>(null);
  const retryTimerRef = useRef<number | null>(null);

  toastRef.current = toast;

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;

    let isActive = true;
    let appStateListener: { remove: () => Promise<void> } | null = null;
    const platform = Capacitor.getPlatform();
    const shouldAttemptPush = platform !== "web";

    const clearRetryTimer = () => {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };

    const scheduleRetry = (reason: string) => {
      if (!shouldAttemptPush || registeredRef.current || !isActive) return;

      clearRetryTimer();
      retryTimerRef.current = window.setTimeout(() => {
        if (!isActive || registeredRef.current) return;
        console.log(`[Push] Retrying registration (${reason})`);
        void attemptRegistration(`retry:${reason}`);
      }, 2500);
    };

    const persistToken = async (tokenValue: string) => {
      if (!isActive || savedTokenRef.current === tokenValue) return;

      console.log("[Push] Persisting APNs token for user:", userId.slice(0, 8));

      const { error } = await supabase.from("push_tokens").upsert(
        {
          user_id: userId,
          token: tokenValue,
          platform,
        },
        { onConflict: "user_id,token" }
      );

      if (error) {
        console.error("[Push] ❌ Token save failed:", error.message);
        registeredRef.current = false;
        scheduleRetry("persist-failed");
        return;
      }

      savedTokenRef.current = tokenValue;
      registeredRef.current = true;
      clearRetryTimer();
      console.log("[Push] ✅ Token saved to database");
    };

    const attemptRegistration = async (reason: string) => {
      if (!shouldAttemptPush || !isActive) return;

      try {
        console.log(`[Push] Starting registration (${reason}) on ${platform} for user ${userId.slice(0, 8)}`);

        const checkedPermissions = await PushNotifications.checkPermissions().catch(() => ({ receive: "prompt" as const }));
        console.log("[Push] Existing permission state:", checkedPermissions.receive);

        const permissionResult = checkedPermissions.receive === "prompt"
          ? await PushNotifications.requestPermissions()
          : checkedPermissions;

        console.log("[Push] Permission result:", permissionResult.receive);

        if (permissionResult.receive !== "granted") {
          console.warn("[Push] Notification permission not granted");
          registeredRef.current = false;
          return;
        }

        await PushNotifications.register();
        console.log("[Push] register() called — waiting for native APNs callback");
        scheduleRetry("awaiting-native-callback");
      } catch (err: any) {
        console.error("[Push] Registration attempt failed:", err?.message || err);
        scheduleRetry("exception");
      }
    };

    const setup = async () => {
      if (!shouldAttemptPush) {
        console.log("[Push] Web platform detected — native push registration skipped");
        return;
      }

      try {
        try {
          await PushNotifications.removeAllListeners();
        } catch {
          // ignore
        }

        await PushNotifications.addListener("registration", async (token) => {
          if (!isActive) return;
          console.log("[Push] ✅ Native registration token received:", `${token.value.slice(0, 16)}...`);
          await persistToken(token.value);
        });

        await PushNotifications.addListener("registrationError", (err) => {
          console.error("[Push] ❌ Native registration error:", JSON.stringify(err));
          registeredRef.current = false;
          scheduleRetry("registration-error");
        });

        await PushNotifications.addListener("pushNotificationReceived", (notification) => {
          console.log("[Push] Foreground notification:", notification);
          toastRef.current({
            title: notification.title || "New notification",
            description: notification.body || "",
          });
        });

        await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          console.log("[Push] Notification tapped:", action);
          const route = action.notification?.data?.route || "/messages";
          window.location.href = route;
        });

        appStateListener = await App.addListener("appStateChange", ({ isActive: appIsActive }) => {
          if (appIsActive && !registeredRef.current) {
            void attemptRegistration("app-state-active");
          }
        });

        void attemptRegistration("initial");
      } catch (err: any) {
        console.error("[Push] Setup failed:", err?.message || err);
        scheduleRetry("setup-failed");
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible" && !registeredRef.current) {
        void attemptRegistration("visibility-visible");
      }
    };

    void setup();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      isActive = false;
      registeredRef.current = false;
      savedTokenRef.current = null;
      clearRetryTimer();
      document.removeEventListener("visibilitychange", handleVisibility);
      if (appStateListener) {
        void appStateListener.remove();
      }
      try {
        void PushNotifications.removeAllListeners();
      } catch {
        // ignore
      }
    };
  }, [user?.id]);
}

export async function clearPushBadge() {
  try {
    await PushNotifications.removeAllDeliveredNotifications();
  } catch {
    // Not available on web
  }
}

export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  notificationType: "message" | "checkin" = "message",
  data?: Record<string, string>
) {
  try {
    const { error } = await supabase.functions.invoke("send-push-notification", {
      body: {
        user_id: userId,
        title,
        body,
        notification_type: notificationType,
        data: data || {},
      },
    });
    if (error) console.error("[Push] Send error:", error);
  } catch (err) {
    console.error("[Push] Invoke error:", err);
  }
}
