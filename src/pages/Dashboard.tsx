import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import TodayWorkout from "@/components/dashboard/TodayWorkout";
import MacroSummary from "@/components/dashboard/MacroSummary";
import ComplianceScore from "@/components/dashboard/ComplianceScore";
import ClientCards from "@/components/dashboard/ClientCards";

const Dashboard = () => {
  const { role } = useAuth();

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            {role === "coach" ? "Coach Dashboard" : role === "admin" ? "Admin Dashboard" : "Your Dashboard"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Welcome back. Here's your overview.
          </p>
        </div>

        {/* Client View */}
        {role === "client" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TodayWorkout />
              <MacroSummary />
            </div>
            <ComplianceScore />
          </div>
        )}

        {/* Coach View */}
        {(role === "coach" || role === "admin") && (
          <div className="space-y-6">
            <ClientCards />
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Dashboard;
