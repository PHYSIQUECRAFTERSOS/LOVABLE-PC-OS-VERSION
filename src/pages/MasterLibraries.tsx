import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dumbbell, FolderOpen } from "lucide-react";
import ExerciseLibrary from "@/components/training/ExerciseLibrary";

const MasterLibraries = () => {
  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Master Libraries</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reusable programs and exercises for your coaching business.
          </p>
        </div>

        <Tabs defaultValue="exercises" className="space-y-4">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="programs" className="gap-1.5">
              <FolderOpen className="h-3.5 w-3.5" /> Programs
            </TabsTrigger>
            <TabsTrigger value="exercises" className="gap-1.5">
              <Dumbbell className="h-3.5 w-3.5" /> Exercises
            </TabsTrigger>
          </TabsList>

          <TabsContent value="programs" className="space-y-4">
            <div className="text-center py-12 text-muted-foreground text-sm">
              Programs will be available in Phase 2.
            </div>
          </TabsContent>

          <TabsContent value="exercises" className="space-y-4">
            <ExerciseLibrary />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default MasterLibraries;
