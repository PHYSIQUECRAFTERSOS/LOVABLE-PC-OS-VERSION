import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, MessageSquare, ClipboardCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Capacitor } from "@capacitor/core";

const NotificationSettings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messagesEnabled, setMessagesEnabled] = useState(true);
  const [checkinEnabled, setCheckinEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    if (!user) return;
    supabase
      .from("notification_preferences" as any)
      .select("messages_enabled, checkin_reminders_enabled")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data) {
          setMessagesEnabled(data.messages_enabled ?? true);
          setCheckinEnabled(data.checkin_reminders_enabled ?? true);
        }
        setLoading(false);
      });
  }, [user]);

  const updatePref = async (field: string, value: boolean) => {
    if (!user) return;
    const { error } = await (supabase.from("notification_preferences" as any) as any).upsert(
      {
        user_id: user.id,
        [field]: value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Preferences updated ✓" });
    }
  };

  const handleMessagesToggle = (val: boolean) => {
    setMessagesEnabled(val);
    updatePref("messages_enabled", val);
  };

  const handleCheckinToggle = (val: boolean) => {
    setCheckinEnabled(val);
    updatePref("checkin_reminders_enabled", val);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          Notifications
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {!isNative && (
          <p className="text-sm text-muted-foreground">
            Push notifications are available when using the native iOS app. Install from the App Store for real-time alerts.
          </p>
        )}

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <div>
              <Label className="text-sm font-medium">Coach Messages</Label>
              <p className="text-xs text-muted-foreground">
                Get notified when your coach sends a message
              </p>
            </div>
          </div>
          <Switch
            checked={messagesEnabled}
            onCheckedChange={handleMessagesToggle}
            disabled={loading}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            <div>
              <Label className="text-sm font-medium">Check-in Reminders</Label>
              <p className="text-xs text-muted-foreground">
                Reminders when a check-in is due
              </p>
            </div>
          </div>
          <Switch
            checked={checkinEnabled}
            onCheckedChange={handleCheckinToggle}
            disabled={loading}
          />
        </div>

        <p className="text-[11px] text-muted-foreground/70 pt-2 border-t border-border">
          You can also manage notification permissions in your device's Settings app under Physique Crafters.
        </p>
      </CardContent>
    </Card>
  );
};

export default NotificationSettings;
