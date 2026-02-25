import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  MessageSquare,
  Edit,
  Calendar,
  StickyNote,
  Dumbbell,
  UtensilsCrossed,
  Activity,
  BarChart3,
  Users,
  Zap,
  TrendingUp,
  Weight,
} from "lucide-react";
import ClientWorkspaceSummary from "@/components/clients/workspace/SummaryTab";
import ClientWorkspaceExercise from "@/components/clients/workspace/ExerciseTab";
import ClientWorkspaceNutrition from "@/components/clients/workspace/NutritionTab";
import ClientWorkspaceWeight from "@/components/clients/workspace/WeightTab";
import ClientWorkspaceProgress from "@/components/clients/workspace/ProgressTab";
import ClientWorkspaceEngagement from "@/components/clients/workspace/EngagementTab";
import ClientWorkspaceNotes from "@/components/clients/workspace/NotesTab";

interface ClientProfile {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
}

const ClientDetail = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("summary");
  const [programName, setProgramName] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);

  useEffect(() => {
    if (!clientId || !user) return;
    const load = async () => {
      setLoading(true);
      const [profileRes, tagsRes, programRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, avatar_url, phone").eq("user_id", clientId).single(),
        supabase.from("client_tags").select("tag").eq("client_id", clientId).eq("coach_id", user.id),
        supabase
          .from("client_program_assignments")
          .select("program_id, programs(name)")
          .eq("client_id", clientId)
          .eq("status", "active")
          .limit(1)
          .maybeSingle(),
      ]);
      setProfile(profileRes.data as ClientProfile | null);
      setTags((tagsRes.data || []).map((t: any) => t.tag));
      setProgramName((programRes.data as any)?.programs?.name || null);
      setLoading(false);
    };
    load();
  }, [clientId, user]);

  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-6 animate-fade-in">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
          <Skeleton className="h-[400px] w-full rounded-xl" />
        </div>
      </AppLayout>
    );
  }

  if (!profile) {
    return (
      <AppLayout>
        <div className="text-center py-20">
          <p className="text-muted-foreground">Client not found.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/clients")}>
            Back to Clients
          </Button>
        </div>
      </AppLayout>
    );
  }

  const tabItems = [
    { value: "summary", label: "Summary", icon: Activity },
    { value: "exercise", label: "Exercise", icon: Dumbbell },
    { value: "nutrition", label: "Nutrition", icon: UtensilsCrossed },
    { value: "weight", label: "Weight", icon: Weight },
    { value: "progress", label: "Progress", icon: BarChart3 },
    { value: "engagement", label: "Engagement", icon: TrendingUp },
    { value: "notes", label: "Notes", icon: StickyNote },
  ];

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/clients")} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Avatar className="h-12 w-12 border-2 border-primary/20">
            <AvatarImage src={profile.avatar_url || undefined} alt={profile.full_name || ""} />
            <AvatarFallback className="text-lg font-bold bg-primary/10 text-primary">
              {(profile.full_name || "C").charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-xl font-bold text-foreground truncate">
              {profile.full_name || "Client"}
            </h1>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {programName && (
                <Badge variant="secondary" className="text-[10px]">
                  <Dumbbell className="h-2.5 w-2.5 mr-1" />
                  {programName}
                </Badge>
              )}
              {tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="outline" className="text-[10px]">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => navigate("/messages")}>
              <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
              Message
            </Button>
          </div>
        </div>

        {/* Workspace Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
            {tabItems.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5 shrink-0">
                <tab.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="summary">
            <ClientWorkspaceSummary clientId={clientId!} />
          </TabsContent>
          <TabsContent value="exercise">
            <ClientWorkspaceExercise clientId={clientId!} />
          </TabsContent>
          <TabsContent value="nutrition">
            <ClientWorkspaceNutrition clientId={clientId!} />
          </TabsContent>
          <TabsContent value="weight">
            <ClientWorkspaceWeight clientId={clientId!} />
          </TabsContent>
          <TabsContent value="progress">
            <ClientWorkspaceProgress clientId={clientId!} />
          </TabsContent>
          <TabsContent value="engagement">
            <ClientWorkspaceEngagement clientId={clientId!} />
          </TabsContent>
          <TabsContent value="notes">
            <ClientWorkspaceNotes clientId={clientId!} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default ClientDetail;
