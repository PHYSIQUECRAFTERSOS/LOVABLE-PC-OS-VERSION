import { useState, useCallback } from "react";
import { format } from "date-fns";
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
import CoachCommandCenter from "@/components/dashboard/CoachCommandCenter";
import DateNavigator from "@/components/dashboard/DateNavigator";
import CoachPriority from "@/components/dashboard/CoachPriority";
import WeeklyMomentumScore from "@/components/dashboard/WeeklyMomentumScore";
import ProgressWidgetGrid from "@/components/dashboard/ProgressWidgetGrid";

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
  const [selectedDate, setSelectedDate] = useState(new Date());

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const handleActionsLoaded = useCallback((items: ActionItem[]) => {
    setTodayItems(items);
  }, []);

  const completedCount = todayItems.filter((a) => a.completed).length;
  const totalCount = todayItems.length;

  return (
    <>
      {/* Date Navigator */}
      <DateNavigator selectedDate={selectedDate} onDateChange={setSelectedDate} />

      {/* Coach Priority */}
      <CoachPriority actions={todayItems} />

      {/* Hero row: Completion ring + Today's Actions */}
      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-4">
        <DailyCompletionRing
          completed={completedCount}
          total={totalCount}
          streak={streak}
        />
        <TodayActions date={dateStr} onDataLoaded={handleActionsLoaded} />
      </div>

      {/* Progress Widget Grid */}
      <ProgressWidgetGrid />

      {/* Weekly Score + Momentum */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <WeeklyMomentumScore />
        <div className="md:col-span-2">
          <ComplianceMomentum data={last30} />
        </div>
      </div>

      {/* Progress */}
      <ProgressMomentum />

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
