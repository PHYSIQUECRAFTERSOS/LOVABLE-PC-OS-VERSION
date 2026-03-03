import { useState, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { withTimeout, TIMEOUTS } from "@/lib/performance";
import HealthIntegrations from "@/components/settings/HealthIntegrations";
import AvatarUpload from "@/components/profile/AvatarUpload";
import DeleteAccountSection from "@/components/settings/DeleteAccountSection";

const Profile = () => {
  const { user, roles } = useAuth();
  const { toast } = useToast();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      supabase
        .from("profiles")
        .select("full_name, phone, avatar_url")
        .eq("user_id", user.id)
        .single()
        .then(({ data, error }) => {
          if (error) {
            console.error("[Profile] Fetch error:", error.message);
          }
          if (data) {
            setFullName(data.full_name || "");
            setPhone(data.phone || "");
            setAvatarUrl(data.avatar_url || null);
          }
        });
    }
  }, [user]);

  const handleSave = async () => {
    if (!user) {
      toast({ title: "Session expired", description: "Please sign in again.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { error } = await withTimeout(
        Promise.resolve(
          supabase
            .from("profiles")
            .update({ full_name: fullName, phone })
            .eq("user_id", user.id)
        ),
        TIMEOUTS.STANDARD_API,
        "profile-save"
      );

      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Profile updated ✓" });
      }
    } catch (err: any) {
      console.error("[Profile] Save failed:", err);
      toast({ title: "Save failed", description: err.message || "Request timed out. Try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6 max-w-lg">
        <h1 className="font-display text-2xl font-bold text-foreground">Settings</h1>
        <Card>
          <CardHeader>
            <CardTitle>Your Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <AvatarUpload
              currentUrl={avatarUrl}
              fullName={fullName}
              onUploaded={(url) => setAvatarUrl(url)}
            />
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user?.email || ""} disabled />
            </div>
            <div className="space-y-2">
              <Label>Roles</Label>
              <Input value={roles.join(", ")} disabled className="capitalize" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <Button onClick={handleSave} disabled={loading}>
              {loading && <Loader2 className="animate-spin" />}
              Save Changes
            </Button>
          </CardContent>
        </Card>
        <HealthIntegrations />
        <DeleteAccountSection />
      </div>
    </AppLayout>
  );
};

export default Profile;
