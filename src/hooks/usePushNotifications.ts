import { useEffect, useRef } from "react";
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

  useEffect(() => {
    if (!user || registeredRef.current) return;

    let isActive = true;

    const setup = async () => {
      try {
        console.log("[Push] Starting registration for user:", user.id.slice(0, 8));

        await PushNotifications.removeAllListeners();

        await PushNotifications.addListener("registration", async (token) => {
          if (!isActive) return;
          console.log("[Push] ✅ Token received:", token.value.slice(0, 16) + "...");

          const { error } = await supabase
            .from("push_tokens" as any)
            .upsert(
              {
                user_id: user.id,
                token: token.value,
                platform: "ios",
              },
              { onConflict: "user_id,token" }
            );

          if (error) {
            console.error("[Push] ❌ Token save error:", error.message);
          } else {
            console.log("[Push] ✅ Token saved to database");
          }
        });

        await PushNotifications.addListener("registrationError", (err) => {
          console.error("[Push] ❌ Registration error:", JSON.stringify(err));
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
        console.log("[Push] Permission result:", permResult.receive);

        if (permResult.receive !== "granted") {
          console.log("[Push] ⚠️ Permission not granted");
          return;
        }

        await PushNotifications.register();
        console.log("[Push] ✅ register() called successfully");

        if (isActive) {
          registeredRef.current = true;
        }
      } catch (err: any) {
        // Plugin not available (running in browser) — this is expected
        console.log("[Push] Plugin not available (expected on web):", err?.message || err);

        // Retry once after 2s in case the native bridge wasn't ready
        if (!registeredRef.current) {
          setTimeout(async () => {
            if (!isActive || registeredRef.current) return;
            try {
              console.log("[Push] Retrying registration...");
              const permResult = await PushNotifications.requestPermissions();
              if (permResult.receive === "granted") {
                await PushNotifications.register();
                registeredRef.current = true;
                console.log("[Push] ✅ Retry succeeded");
              }
            } catch (retryErr: any) {
              console.log("[Push] Retry also failed — not a native platform");
            }
          }, 2000);
        }
      }
    };

    void setup();

    return () => {
      isActive = false;
      registeredRef.current = false;
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
