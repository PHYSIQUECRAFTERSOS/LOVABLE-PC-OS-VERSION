import { useChallenges } from "@/hooks/useChallenges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Flame, Users, Trophy } from "lucide-react";
import CoachCulturePanel from "@/components/culture/CoachCulturePanel";

const TeamPulseTab = () => {
  const { data: challenges } = useChallenges();

  const activeChallenges = (challenges || []).filter((c) => c.status === "active");
  const totalParticipants = activeChallenges.reduce((sum, c) => sum + (c.participant_count || 0), 0);

  return (
    <div className="space-y-4">
      {/* Quick Challenge Stats */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="border-border bg-card">
          <CardContent className="p-3 text-center">
            <Flame className="h-4 w-4 text-primary mx-auto mb-1" />
            <p className="text-lg font-bold text-primary">{activeChallenges.length}</p>
            <p className="text-[10px] text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-3 text-center">
            <Users className="h-4 w-4 text-blue-400 mx-auto mb-1" />
            <p className="text-lg font-bold text-blue-400">{totalParticipants}</p>
            <p className="text-[10px] text-muted-foreground">Participants</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-3 text-center">
            <Trophy className="h-4 w-4 text-primary mx-auto mb-1" />
            <p className="text-lg font-bold text-primary">{(challenges || []).filter((c) => c.status === "completed").length}</p>
            <p className="text-[10px] text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
      </div>

      {/* Existing Coach Culture Panel */}
      <CoachCulturePanel />
    </div>
  );
};

export default TeamPulseTab;
