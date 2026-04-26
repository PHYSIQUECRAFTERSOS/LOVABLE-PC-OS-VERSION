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
import LabelRepairTool from "@/components/admin/LabelRepairTool";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Database, Loader2, Wrench } from "lucide-react";
import { Link } from "react-router-dom";

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

        <LabelRepairTool />

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">Database Utilities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Button onClick={handleSeedFoods} disabled={seeding} variant="outline" className="gap-2">
                {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                {seeding ? "Seeding…" : "Seed Food Database"}
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Populates the local food cache with ~500 staple items from USDA. Only needs to run once.
              </p>
            </div>
            <div className="border-t border-border pt-3">
              <Button asChild variant="outline" className="gap-2">
                <Link to="/admin/repair-saved-meals">
                  <Wrench className="h-4 w-4" />
                  Repair My Meals (Portion Corruption)
                </Link>
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Scan & repair saved-meal items stuck at "1g" with full-portion macros. Dry-run preview required before commit.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Admin;
