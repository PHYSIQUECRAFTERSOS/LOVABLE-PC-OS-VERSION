import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, Copy, GripVertical, Dumbbell, FolderOpen, Play } from "lucide-react";

const samplePrograms = [
  { id: "1", name: "PPL Hypertrophy A", weeks: 8, days: 6, clients: 5, category: "Hypertrophy" },
  { id: "2", name: "Upper Lower Power", weeks: 6, days: 4, clients: 3, category: "Strength" },
  { id: "3", name: "Full Body Beginner", weeks: 12, days: 3, clients: 8, category: "General" },
];

const sampleExercises = [
  { id: "1", name: "Barbell Back Squat", category: "Quads", hasVideo: true },
  { id: "2", name: "Romanian Deadlift", category: "Hamstrings", hasVideo: true },
  { id: "3", name: "Incline Dumbbell Press", category: "Chest", hasVideo: false },
  { id: "4", name: "Pull-Up", category: "Back", hasVideo: true },
  { id: "5", name: "Lateral Raise", category: "Shoulders", hasVideo: false },
];

const MasterLibraries = () => {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Master Libraries</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reusable programs and exercises for your coaching business.
          </p>
        </div>

        <Tabs defaultValue="programs" className="space-y-4">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="programs">Programs</TabsTrigger>
            <TabsTrigger value="exercises">Exercises</TabsTrigger>
          </TabsList>

          <TabsContent value="programs" className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search programs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button>
                <Plus className="h-4 w-4 mr-1" /> New Program
              </Button>
            </div>

            <div className="space-y-3">
              {samplePrograms.map((program) => (
                <Card key={program.id} className="border-border bg-card hover:border-primary/30 transition-colors cursor-pointer">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <GripVertical className="h-4 w-4 text-muted-foreground/50 hidden md:block" />
                      <FolderOpen className="h-5 w-5 text-primary" />
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-foreground">{program.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {program.weeks} weeks • {program.days} days/week • {program.clients} clients assigned
                        </p>
                      </div>
                      <Badge variant="secondary">{program.category}</Badge>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="exercises" className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search exercises..."
                  className="pl-9"
                />
              </div>
              <Button>
                <Plus className="h-4 w-4 mr-1" /> New Exercise
              </Button>
            </div>

            <div className="space-y-2">
              {sampleExercises.map((exercise) => (
                <Card key={exercise.id} className="border-border bg-card hover:border-primary/30 transition-colors cursor-pointer">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <Dumbbell className="h-4 w-4 text-primary" />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-foreground">{exercise.name}</span>
                      </div>
                      <Badge variant="outline" className="text-xs">{exercise.category}</Badge>
                      {exercise.hasVideo && (
                        <Play className="h-3.5 w-3.5 text-primary" />
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default MasterLibraries;
