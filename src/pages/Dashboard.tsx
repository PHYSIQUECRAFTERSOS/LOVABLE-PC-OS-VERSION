import { useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import TodayActions, { ActionItem } from "@/components/dashboard/TodayActions";
import DailyCompletionRing from "@/components/dashboard/DailyCompletionRing";
import { useConsistencyStreak } from "@/components/dashboard/ConsistencyStreak";
import ComplianceMomentum from "@/components/dashboard/ComplianceMomentum";
import ProgressMomentum from "@/components/dashboard/ProgressMomentum";
import MacroSummary from "@/components/dashboard/MacroSummary";
import UpcomingEvents from "@/components/dashboard/UpcomingEvents";
import QuickLogFAB from "@/components/dashboard/QuickLogFAB";
import RecommitFlow from "@/components/retention/RecommitFlow";
import CoachCommandCenter from "@/components/dashboard/CoachCommandCenter";

const Dashboard = () => {
  const { role } = useAuth();
  const isClient = role === "client";

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

        {isClient && <ClientDashboard />}
        {(role === "coach" || role === "admin") && <CoachCommandCenter />}
      </div>
    </AppLayout>
  );
};

const ClientDashboard = () => {
  const { streak, last30 } = useConsistencyStreak();
  const [todayItems, setTodayItems] = useState<ActionItem[]>([]);

  const handleActionsLoaded = useCallback((items: ActionItem[]) => {
    setTodayItems(items);
  }, []);

  const completedCount = todayItems.filter((a) => a.completed).length;
  const totalCount = todayItems.length;

  return (
    <>
      <RecommitFlow />

      {/* Hero row: Completion ring + Today's Actions */}
      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-4">
        <DailyCompletionRing
          completed={completedCount}
          total={totalCount}
          streak={streak}
        />
        <TodayActions onDataLoaded={handleActionsLoaded} />
      </div>

      {/* Momentum row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ComplianceMomentum data={last30} />
        <ProgressMomentum />
      </div>

      {/* Nutrition */}
      <MacroSummary />

      {/* Upcoming */}
      <UpcomingEvents />

      {/* Quick Log FAB */}
      <QuickLogFAB />
    </>
  );
};

export default Dashboard;
