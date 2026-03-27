import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

/**
 * Detect if push notifications are available.
 * Since the app runs as a remote URL inside a Capacitor WKWebView,
 * Capacitor.isNativePlatform() may return false. Instead check plugin availability
 * AND the presence of the Capacitor native bridge.
 */
const canUsePush = (): boolean => {
  try {
    // Check if the PushNotifications plugin is available
    if (Capacitor.isPluginAvailable('PushNotifications')) return true;
    // Fallback: check for native bridge (Capacitor iOS injects this)
    if ((window as any).Capacitor?.isNativePlatform?.()) return true;
    if ((window as any).webkit?.messageHandlers?.bridge) return true;
    return false;
  } catch {
    return false;
  }
};

const getPushPlatform = (): "ios" | "android" => {
  try {
    return Capacitor.getPlatform() === "android" ? "android" : "ios";
  } catch {
    return "ios";
  }
};

export function usePushNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!user || registeredRef.current) return;

    const isPushAvailable = canUsePush();
    console.log("[Push] canUsePush:", isPushAvailable, "isNative:", Capacitor.isNativePlatform(), "pluginAvailable:", Capacitor.isPluginAvailable('PushNotifications'));

    if (!isPushAvailable) return;

    let isActive = true;

    const setup = async () => {
      try {
        await PushNotifications.removeAllListeners();

        await PushNotifications.addListener("registration", async (token) => {
          if (!isActive) return;

          console.log("[Push] Token received:", token.value.slice(0, 12) + "...");

          const { error } = await supabase
            .from("push_tokens" as any)
            .upsert(
              {
                user_id: user.id,
                token: token.value,
                platform: getPushPlatform(),
              },
              { onConflict: "user_id,token" }
            );

          if (error) {
            console.error("[Push] Token save error:", error.message);
          } else {
            console.log("[Push] Token saved successfully");
          }
        });

        await PushNotifications.addListener("registrationError", (err) => {
          console.error("[Push] Registration error:", err);
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

        const permResult = await PushNotifications.requestPermissions();
        if (permResult.receive !== "granted") {
          console.log("[Push] Permission not granted:", permResult.receive);
          return;
        }

        await PushNotifications.register();
        if (isActive) {
          registeredRef.current = true;
        }
      } catch (err) {
        console.error("[Push] Setup error:", err);
      }
    };

    void setup();

    return () => {
      isActive = false;
      registeredRef.current = false;

      if (canUsePush()) {
        void PushNotifications.removeAllListeners();
      }
    };
  }, [user, toast]);
}

/**
 * Call this to clear the badge and delivered notifications when user reads messages
 */
export async function clearPushBadge() {
  if (!canUsePush()) return;
  try {
    await PushNotifications.removeAllDeliveredNotifications();
  } catch (err) {
    console.error("[Push] Clear badge error:", err);
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
