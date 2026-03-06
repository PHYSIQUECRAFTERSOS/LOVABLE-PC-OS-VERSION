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
import { useLoggingStreak } from "@/hooks/useLoggingStreak";
import { Skeleton } from "@/components/ui/skeleton";

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
  const { streak: consistencyStreak, last30 } = useConsistencyStreak();
  const { streak: loggingStreak, loading: streakLoading } = useLoggingStreak();
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

      {/* Logging Streak Widget */}
      <LoggingStreakWidget streak={loggingStreak} loading={streakLoading} />

      {/* Coach Priority */}
      <CoachPriority actions={todayItems} />

      {/* Hero row: Completion ring + Today's Actions */}
      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-4">
        <DailyCompletionRing
          completed={completedCount}
          total={totalCount}
          streak={consistencyStreak}
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

const LoggingStreakWidget = ({ streak, loading }: { streak: number; loading: boolean }) => {
  if (loading) {
    return <Skeleton className="h-16 w-full rounded-lg" />;
  }

  if (streak > 0) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
        <span className="text-2xl">🔥</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">
            {streak} day{streak !== 1 ? "s" : ""} logged
          </p>
          <p className="text-xs text-muted-foreground">
            Keep it up — log today to extend your streak
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <span className="text-2xl">📋</span>
      <div className="flex-1">
        <p className="text-sm font-semibold text-foreground">Start your logging streak</p>
        <p className="text-xs text-muted-foreground">
          Log your first meal today to begin tracking
        </p>
      </div>
    </div>
  );
};

export default Dashboard;
