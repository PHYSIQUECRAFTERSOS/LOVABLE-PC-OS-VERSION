import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Trophy, Plus, Users, Calendar, Flame, Star, Shield } from "lucide-react";
import CultureLeaderboard from "@/components/culture/CultureLeaderboard";
import IdentityStack from "@/components/culture/IdentityStack";
import CoachCulturePanel from "@/components/culture/CoachCulturePanel";

const sampleChallenges = [
  {
    id: "1",
    title: "30-Day Consistency Challenge",
    status: "active",
    participants: 18,
    daysLeft: 12,
    progress: 60,
    description: "Log all meals and complete every assigned workout for 30 straight days.",
  },
  {
    id: "2",
    title: "10K Steps Daily",
    status: "active",
    participants: 24,
    daysLeft: 5,
    progress: 83,
    description: "Hit 10,000 steps every day for 2 weeks.",
  },
  {
    id: "3",
    title: "Holiday Shred",
    status: "upcoming",
    participants: 0,
    daysLeft: 30,
    progress: 0,
    description: "6-week body recomp challenge with weekly photo submissions.",
  },
];

const Challenges = () => {
  const { role } = useAuth();
  const isCoach = role === "coach" || role === "admin";

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Culture & Challenges</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Compete, grow, and earn your identity.
            </p>
          </div>
          {isCoach && (
            <Button>
              <Plus className="h-4 w-4 mr-1" /> Create Challenge
            </Button>
          )}
        </div>

        <Tabs defaultValue="leaderboard" className="w-full">
          <TabsList className="w-full bg-secondary/50">
            <TabsTrigger value="leaderboard" className="flex-1 gap-1.5 text-xs">
              <Trophy className="h-3.5 w-3.5" /> Leaderboard
            </TabsTrigger>
            <TabsTrigger value="identity" className="flex-1 gap-1.5 text-xs">
              <Shield className="h-3.5 w-3.5" /> My Identity
            </TabsTrigger>
            <TabsTrigger value="challenges" className="flex-1 gap-1.5 text-xs">
              <Flame className="h-3.5 w-3.5" /> Challenges
            </TabsTrigger>
            {isCoach && (
              <TabsTrigger value="culture" className="flex-1 gap-1.5 text-xs">
                <Star className="h-3.5 w-3.5" /> Culture Panel
              </TabsTrigger>
            )}
          </TabsList>

          {/* COMPLIANCE LEADERBOARD */}
          <TabsContent value="leaderboard" className="mt-4">
            <CultureLeaderboard />
          </TabsContent>

          {/* IDENTITY STACK */}
          <TabsContent value="identity" className="mt-4">
            <IdentityStack />
          </TabsContent>

          {/* CHALLENGES */}
          <TabsContent value="challenges" className="mt-4 space-y-4">
            {sampleChallenges.map((challenge) => (
              <Card key={challenge.id} className="border-border bg-card">
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Flame className="h-4 w-4 text-primary" />
                        <h3 className="font-semibold text-foreground">{challenge.title}</h3>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{challenge.description}</p>
                    </div>
                    <Badge variant={challenge.status === "active" ? "default" : "secondary"}>
                      {challenge.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {challenge.participants} joined</span>
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {challenge.daysLeft} days left</span>
                  </div>
                  {challenge.status === "active" && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Progress</span>
                        <span>{challenge.progress}%</span>
                      </div>
                      <Progress value={challenge.progress} className="h-2" />
                    </div>
                  )}
                  {challenge.status === "upcoming" && !isCoach && (
                    <Button size="sm" variant="outline" className="w-full">Join Challenge</Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* COACH CULTURE PANEL */}
          {isCoach && (
            <TabsContent value="culture" className="mt-4">
              <CoachCulturePanel />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Challenges;
