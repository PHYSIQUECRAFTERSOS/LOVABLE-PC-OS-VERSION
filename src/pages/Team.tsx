import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { UserPlus, Shield, Users, Activity } from "lucide-react";

const teamMembers = [
  { name: "Mike Johnson", role: "Admin", initials: "MJ", clients: 0, lastActive: "Now" },
  { name: "Alex Rivera", role: "Head Coach", initials: "AR", clients: 12, lastActive: "2h ago" },
  { name: "Jordan Lee", role: "Assistant Coach", initials: "JL", clients: 8, lastActive: "1d ago" },
];

const roleColors: Record<string, string> = {
  Admin: "bg-primary/20 text-primary",
  "Head Coach": "bg-accent/20 text-accent-foreground",
  "Assistant Coach": "bg-secondary text-secondary-foreground",
};

const Team = () => {
  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Team</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage your coaching staff and permissions.
            </p>
          </div>
          <Button>
            <UserPlus className="h-4 w-4 mr-1" /> Invite Coach
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-border bg-card">
            <CardContent className="pt-4 flex items-center gap-3">
              <Users className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold text-foreground">{teamMembers.length}</p>
                <p className="text-xs text-muted-foreground">Team Members</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="pt-4 flex items-center gap-3">
              <Shield className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold text-foreground">20</p>
                <p className="text-xs text-muted-foreground">Total Clients</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="pt-4 flex items-center gap-3">
              <Activity className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold text-foreground">94%</p>
                <p className="text-xs text-muted-foreground">Avg Response Rate</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Staff</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {teamMembers.map((member) => (
              <div key={member.name} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-secondary text-foreground">{member.initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{member.name}</p>
                  <p className="text-xs text-muted-foreground">{member.clients} clients assigned</p>
                </div>
                <Badge className={roleColors[member.role] || ""}>{member.role}</Badge>
                <span className="text-xs text-muted-foreground hidden sm:inline">{member.lastActive}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Team;
