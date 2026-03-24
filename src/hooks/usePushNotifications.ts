import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

const isNative = Capacitor.isNativePlatform();

export function usePushNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!isNative || !user || registeredRef.current) return;

    const setup = async () => {
      try {
        const permResult = await PushNotifications.requestPermissions();
        if (permResult.receive !== "granted") {
          console.log("[Push] Permission not granted:", permResult.receive);
          return;
        }

        await PushNotifications.register();
        registeredRef.current = true;

        // Token received — save to DB
        PushNotifications.addListener("registration", async (token) => {
          console.log("[Push] Token received:", token.value.slice(0, 12) + "...");
          const { error } = await supabase
            .from("push_tokens" as any)
            .upsert(
              { user_id: user.id, token: token.value, platform: "ios" },
              { onConflict: "user_id,token" }
            );
          if (error) console.error("[Push] Token save error:", error.message);
        });

        // Registration error
        PushNotifications.addListener("registrationError", (err) => {
          console.error("[Push] Registration error:", err);
        });

        // Foreground notification — show toast
        PushNotifications.addListener("pushNotificationReceived", (notification) => {
          console.log("[Push] Foreground notification:", notification);
          toast({
            title: notification.title || "New notification",
            description: notification.body || "",
          });
        });

        // Notification tapped — navigate to messages
        PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          console.log("[Push] Notification tapped:", action);
          const route = action.notification?.data?.route || "/messages";
          window.location.href = route;
        });
      } catch (err) {
        console.error("[Push] Setup error:", err);
      }
    };

    setup();

    return () => {
      if (isNative) {
        PushNotifications.removeAllListeners();
      }
    };
  }, [user]);
}

/**
 * Call this to clear the badge and delivered notifications when user reads messages
 */
export async function clearPushBadge() {
  if (!isNative) return;
  try {
    await PushNotifications.removeAllDeliveredNotifications();
    // Badge plugin not available — use native bridge if needed later
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
