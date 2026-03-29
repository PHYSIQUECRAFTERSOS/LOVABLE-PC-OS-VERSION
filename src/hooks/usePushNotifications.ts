import { useEffect, useRef } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PushNotifications } from "@capacitor/push-notifications";

/**
 * Always attempt push registration on any platform.
 * If the plugin isn't available, PushNotifications calls will throw
 * and we catch gracefully. No more bridge-sniffing.
 */

export function usePushNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const registeredRef = useRef(false);
  const savedTokenRef = useRef<string | null>(null);
  const retryTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!user || registeredRef.current) return;

    let isActive = true;
    let appStateListener: { remove: () => Promise<void> } | null = null;
    const isNativePlatform = Capacitor.isNativePlatform();

    const clearRetryTimer = () => {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };

    const persistToken = async (tokenValue: string) => {
      if (!isActive || savedTokenRef.current === tokenValue) return;

      const { error } = await supabase
        .from("push_tokens")
        .upsert(
          {
            user_id: user.id,
            token: tokenValue,
            platform: Capacitor.getPlatform() || "ios",
          },
          { onConflict: "user_id,token" }
        );

      if (error) {
        console.error("[Push] ❌ Token save error:", error.message);
        registeredRef.current = false;
        return;
      }

      savedTokenRef.current = tokenValue;
      registeredRef.current = true;
      clearRetryTimer();
      console.log("[Push] ✅ Token saved to database");
    };

    const scheduleRetry = (reason: string) => {
      if (!isNativePlatform || registeredRef.current || !isActive) return;
      clearRetryTimer();
      retryTimerRef.current = window.setTimeout(() => {
        if (!isActive || registeredRef.current) return;
        console.log(`[Push] Retrying registration (${reason})...`);
        void attemptRegistration(`retry:${reason}`);
      }, 3000);
    };

    const attemptRegistration = async (reason: string) => {
      try {
        console.log(`[Push] Starting registration (${reason}) for user:`, user.id.slice(0, 8));

        const permResult = await PushNotifications.requestPermissions();
        console.log("[Push] Permission result:", permResult.receive);

        if (permResult.receive !== "granted") {
          console.log("[Push] ⚠️ Permission not granted");
          registeredRef.current = false;
          return;
        }

        await PushNotifications.register();
        console.log("[Push] ✅ register() called successfully");

        if (!registeredRef.current) {
          scheduleRetry("no-registration-event");
        }
      } catch (err: any) {
        console.log("[Push] Registration attempt failed:", err?.message || err);
        scheduleRetry("exception");
      }
    };

    const setup = async () => {
      try {
        await PushNotifications.removeAllListeners();

        await PushNotifications.addListener("registration", async (token) => {
          if (!isActive) return;
          console.log("[Push] ✅ Token received:", token.value.slice(0, 16) + "...");
          await persistToken(token.value);
        });

        await PushNotifications.addListener("registrationError", (err) => {
          console.error("[Push] ❌ Registration error:", JSON.stringify(err));
          registeredRef.current = false;
          scheduleRetry("registration-error");
        });

        await PushNotifications.addListener("pushNotificationReceived", (notification) => {
          console.log("[Push] Foreground notification:", notification);
          toast({
            title: notification.title || "New notification",
            description: notification.body || "",
          });
        });

        await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          console.log("[Push] Notification tapped:", action);
          const route = action.notification?.data?.route || "/messages";
          window.location.href = route;
        });

        if (isNativePlatform) {
          appStateListener = await App.addListener("appStateChange", ({ isActive: appIsActive }) => {
            if (!appIsActive) return;
            if (!registeredRef.current) {
              void attemptRegistration("app-state-active");
            }
          });
        }

        void attemptRegistration("initial");
      } catch (err: any) {
        console.log("[Push] Plugin not available (expected on web):", err?.message || err);
        scheduleRetry("setup-failure");
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
        // Not available
      }
    };
  }, [user, toast]);
}

/**
 * Call this to clear the badge and delivered notifications when user reads messages
 */
export async function clearPushBadge() {
  try {
    await PushNotifications.removeAllDeliveredNotifications();
  } catch {
    // Not available on web
  }
}

/**
 * Send push notification to a user via the edge function
 */
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
