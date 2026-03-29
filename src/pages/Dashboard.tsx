import { useState, useCallback, useEffect } from "react";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import TodayActions, { ActionItem } from "@/components/dashboard/TodayActions";
import DailyCompletionRing from "@/components/dashboard/DailyCompletionRing";
import { useConsistencyStreak } from "@/components/dashboard/ConsistencyStreak";
import CommunityQuickAccess from "@/components/dashboard/CommunityQuickAccess";
import ProgressMomentum from "@/components/dashboard/ProgressMomentum";
import MacroSummary from "@/components/dashboard/MacroSummary";
import UpcomingEvents from "@/components/dashboard/UpcomingEvents";
import QuickLogFAB from "@/components/dashboard/QuickLogFAB";
import CoachCommandCenter from "@/components/dashboard/CoachCommandCenter";
import DateNavigator from "@/components/dashboard/DateNavigator";
import CoachPriority from "@/components/dashboard/CoachPriority";
import ProgressWidgetGrid from "@/components/dashboard/ProgressWidgetGrid";
import { useLoggingStreak } from "@/hooks/useLoggingStreak";
import { useWorkoutStreak } from "@/hooks/useWorkoutStreak";
import { Skeleton } from "@/components/ui/skeleton";
import ChallengeBanner from "@/components/dashboard/ChallengeBanner";
import MyRankDashboardCard from "@/components/dashboard/MyRankDashboardCard";

import PendingRankUpPopup from "@/components/ranked/PendingRankUpPopup";
import DailyRewardsPopup from "@/components/ranked/DailyRewardsPopup";
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
  const { streak: workoutStreak, loading: workoutStreakLoading } = useWorkoutStreak();
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
      {/* Pending Rank-Up Popup (shows missed rank changes on login) */}
      <PendingRankUpPopup />

      {/* Daily XP Evaluation Popup (shows previous day's XP breakdown on first login) */}
      <DailyRewardsPopup />


      {/* Challenge Banner */}
      <ChallengeBanner />

      {/* My Rank Card */}
      <MyRankDashboardCard />

      {/* Date Navigator */}
      <DateNavigator selectedDate={selectedDate} onDateChange={setSelectedDate} />

      {/* Streak Widgets */}
      <StreakWidgets
        loggingStreak={loggingStreak}
        loggingLoading={streakLoading}
        workoutStreak={workoutStreak}
        workoutLoading={workoutStreakLoading}
      />

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

      {/* Community Quick Access */}
      <CommunityQuickAccess />

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

interface StreakWidgetsProps {
  loggingStreak: number;
  loggingLoading: boolean;
  workoutStreak: number;
  workoutLoading: boolean;
}

const StreakWidgets = ({ loggingStreak, loggingLoading, workoutStreak, workoutLoading }: StreakWidgetsProps) => {
  if (loggingLoading || workoutLoading) {
    return <Skeleton className="h-16 w-full rounded-lg" />;
  }

  const hasAnyStreak = loggingStreak > 0 || workoutStreak > 0;

  if (!hasAnyStreak) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <span className="text-2xl">🏁</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Start your streak today</p>
          <p className="text-xs text-muted-foreground">
            Complete a workout or log a meal to begin
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {workoutStreak > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
          <span className="text-2xl">💪</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">
              {workoutStreak} day{workoutStreak !== 1 ? "s" : ""} training
            </p>
            <p className="text-xs text-muted-foreground">
              Complete today's session to extend your streak
            </p>
          </div>
        </div>
      )}
      {loggingStreak > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
          <span className="text-2xl">🔥</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">
              {loggingStreak} day{loggingStreak !== 1 ? "s" : ""} logged
            </p>
            <p className="text-xs text-muted-foreground">
              Keep it up — log today to extend your streak
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
