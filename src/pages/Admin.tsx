import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import PlatformMetrics from "@/components/admin/PlatformMetrics";
import UserManagement from "@/components/admin/UserManagement";
import BulkNotifications from "@/components/admin/BulkNotifications";
import ComplianceOverview from "@/components/admin/ComplianceOverview";
import RetentionPanel from "@/components/admin/RetentionPanel";
import DocumentManagement from "@/components/admin/DocumentManagement";
import InviteDashboard from "@/components/clients/InviteDashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Database, Loader2 } from "lucide-react";

const Admin = () => {
  const { role, loading } = useAuth();
  const { toast } = useToast();
  const [seeding, setSeeding] = useState(false);

  if (loading) return null;
  if (role !== "admin") return <Navigate to="/dashboard" replace />;

  const handleSeedFoods = async () => {
    setSeeding(true);
    try {
      const { data, error } = await supabase.functions.invoke("seed-foods", {});
      if (error) throw error;
      toast({ title: "Food database seeded", description: `${data?.seeded ?? 0} foods added` });
    } catch (e: any) {
      toast({ title: "Seed failed", description: e.message, variant: "destructive" });
    } finally {
      setSeeding(false);
    }
  };

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Admin Panel</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Platform overview and management tools.
          </p>
        </div>

        <PlatformMetrics />
        <RetentionPanel />

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">Invite Dashboard (All Coaches)</CardTitle>
          </CardHeader>
          <CardContent>
            <InviteDashboard isAdmin />
          </CardContent>
        </Card>

        <ComplianceOverview />
        <DocumentManagement />
        <UserManagement />
        <BulkNotifications />
      </div>
    </AppLayout>
  );
};

export default Admin;
