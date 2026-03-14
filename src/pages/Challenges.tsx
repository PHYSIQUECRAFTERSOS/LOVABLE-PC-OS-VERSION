import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Trophy, Plus, Flame, Star, Shield, Award } from "lucide-react";
import GlobalLeaderboard from "@/components/challenges/GlobalLeaderboard";
import MyRankTab from "@/components/challenges/MyRankTab";
import ChallengesTab from "@/components/challenges/ChallengesTab";
import TeamPulseTab from "@/components/challenges/TeamPulseTab";
import CreateChallengeWizard from "@/components/challenges/CreateChallengeWizard";

const Challenges = () => {
  const { role } = useAuth();
  const isCoach = role === "coach" || role === "admin";
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Culture & Challenges</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Compete, grow, and earn your rank.
            </p>
          </div>
          {isCoach && (
            <Button onClick={() => setWizardOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Create Challenge
            </Button>
          )}
        </div>

        <Tabs defaultValue="leaderboard" className="w-full">
          <TabsList className="w-full bg-secondary/50">
            <TabsTrigger value="leaderboard" className="flex-1 gap-1.5 text-xs">
              <Trophy className="h-3.5 w-3.5" /> Leaderboard
            </TabsTrigger>
            <TabsTrigger value="rank" className="flex-1 gap-1.5 text-xs">
              <Award className="h-3.5 w-3.5" /> My Rank
            </TabsTrigger>
            <TabsTrigger value="challenges" className="flex-1 gap-1.5 text-xs">
              <Flame className="h-3.5 w-3.5" /> Challenges
            </TabsTrigger>
            {isCoach && (
              <TabsTrigger value="pulse" className="flex-1 gap-1.5 text-xs">
                <Star className="h-3.5 w-3.5" /> Team Pulse
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="leaderboard" className="mt-4">
            <GlobalLeaderboard />
          </TabsContent>

          <TabsContent value="rank" className="mt-4">
            <MyRankTab />
          </TabsContent>

          <TabsContent value="challenges" className="mt-4">
            <ChallengesTab />
          </TabsContent>

          {isCoach && (
            <TabsContent value="pulse" className="mt-4">
              <TeamPulseTab />
            </TabsContent>
          )}
        </Tabs>
      </div>

      <CreateChallengeWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </AppLayout>
  );
};

export default Challenges;
