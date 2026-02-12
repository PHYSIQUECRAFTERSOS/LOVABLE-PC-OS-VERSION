import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DailyNutritionLog from "@/components/nutrition/DailyNutritionLog";
import MealPlanBuilder from "@/components/nutrition/MealPlanBuilder";
import MacroTargetEditor from "@/components/nutrition/MacroTargetEditor";

const Nutrition = () => {
  const { role } = useAuth();
  const isCoach = role === "coach" || role === "admin";

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold text-foreground">Nutrition</h1>
          {isCoach && <MacroTargetEditor />}
        </div>

        {isCoach ? (
          <Tabs defaultValue="tracker" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="tracker" className="flex-1">My Tracker</TabsTrigger>
              <TabsTrigger value="mealplans" className="flex-1">Meal Plans</TabsTrigger>
            </TabsList>
            <TabsContent value="tracker">
              <DailyNutritionLog />
            </TabsContent>
            <TabsContent value="mealplans">
              <MealPlanBuilder />
            </TabsContent>
          </Tabs>
        ) : (
          <DailyNutritionLog />
        )}
      </div>
    </AppLayout>
  );
};

export default Nutrition;
