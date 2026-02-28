import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import TodayWorkout from "@/components/dashboard/TodayWorkout";
import MacroSummary from "@/components/dashboard/MacroSummary";
import ComplianceScore from "@/components/dashboard/ComplianceScore";
import StepsCard from "@/components/dashboard/StepsCard";
import RecommitFlow from "@/components/retention/RecommitFlow";
import CoachCommandCenter from "@/components/dashboard/CoachCommandCenter";

const Dashboard = () => {
  const { role } = useAuth();

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            {role === "coach" || role === "admin" ? "Command Center" : "Your Dashboard"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {role === "coach" || role === "admin"
              ? "Prioritized actions, compliance intel, and risk detection."
              : "Welcome back. Here's your overview."}
          </p>
        </div>

        {/* Client View */}
        {role === "client" && (
          <div className="space-y-4">
            <RecommitFlow />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TodayWorkout />
              <MacroSummary />
            </div>
            <StepsCard />
            <ComplianceScore />
          </div>
        )}

        {/* Coach/Admin Command Center */}
        {(role === "coach" || role === "admin") && <CoachCommandCenter />}
      </div>
    </AppLayout>
  );
};

export default Dashboard;
