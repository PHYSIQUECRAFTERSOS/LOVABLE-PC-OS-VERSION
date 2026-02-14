import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import PlatformMetrics from "@/components/admin/PlatformMetrics";
import UserManagement from "@/components/admin/UserManagement";
import BulkNotifications from "@/components/admin/BulkNotifications";
import ComplianceOverview from "@/components/admin/ComplianceOverview";
import RetentionPanel from "@/components/admin/RetentionPanel";

const Admin = () => {
  const { role, loading } = useAuth();

  if (loading) return null;
  if (role !== "admin") return <Navigate to="/dashboard" replace />;

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
        <ComplianceOverview />
        <UserManagement />
        <BulkNotifications />
      </div>
    </AppLayout>
  );
};

export default Admin;
