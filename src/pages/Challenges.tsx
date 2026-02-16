import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Trophy, Plus, Users, Calendar, Flame } from "lucide-react";

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

const leaderboard = [
  { rank: 1, name: "Sarah K.", points: 980 },
  { rank: 2, name: "Marcus T.", points: 945 },
  { rank: 3, name: "Diana L.", points: 920 },
  { rank: 4, name: "Jake R.", points: 890 },
  { rank: 5, name: "Priya M.", points: 855 },
];

const Challenges = () => {
  const { role } = useAuth();
  const isCoach = role === "coach" || role === "admin";

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Challenges</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Compete, stay accountable, and win.
            </p>
          </div>
          {isCoach && (
            <Button>
              <Plus className="h-4 w-4 mr-1" /> Create Challenge
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Challenges List */}
          <div className="lg:col-span-2 space-y-4">
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
          </div>

          {/* Leaderboard */}
          <Card className="border-border bg-card h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Trophy className="h-4 w-4 text-primary" /> Leaderboard
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {leaderboard.map((entry) => (
                <div key={entry.rank} className="flex items-center gap-3 py-1.5">
                  <span className={`w-6 text-center font-bold text-sm ${entry.rank <= 3 ? "text-primary" : "text-muted-foreground"}`}>
                    {entry.rank}
                  </span>
                  <span className="flex-1 text-sm text-foreground">{entry.name}</span>
                  <span className="text-sm font-mono text-muted-foreground">{entry.points}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
};

export default Challenges;
