import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DailyNutritionLog from "@/components/nutrition/DailyNutritionLog";
import MealPlanBuilder from "@/components/nutrition/MealPlanBuilder";
import MacroTargetEditor from "@/components/nutrition/MacroTargetEditor";
import CoachMealPlanUpload from "@/components/nutrition/CoachMealPlanUpload";
import ClientMealPlanView from "@/components/nutrition/ClientMealPlanView";
import MicronutrientDashboard from "@/components/nutrition/MicronutrientDashboard";
import SupplementLogger from "@/components/nutrition/SupplementLogger";
import USDAFoodSearch from "@/components/nutrition/USDAFoodSearch";
import { Pill, FlaskConical } from "lucide-react";

const Nutrition = () => {
  const { role } = useAuth();
  const isCoach = role === "coach" || role === "admin";

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold text-foreground">Nutrition</h1>
          <div className="flex items-center gap-2">
            <USDAFoodSearch onImport={() => {}} />
            {isCoach && <MacroTargetEditor />}
          </div>
        </div>

        <Tabs defaultValue="tracker" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="tracker" className="flex-1">Tracker</TabsTrigger>
            <TabsTrigger value="micros" className="flex-1 gap-1.5">
              <FlaskConical className="h-3.5 w-3.5" />
              Micros
            </TabsTrigger>
            <TabsTrigger value="supplements" className="flex-1 gap-1.5">
              <Pill className="h-3.5 w-3.5" />
              Supps
            </TabsTrigger>
            {isCoach && (
              <TabsTrigger value="mealplans" className="flex-1">Meal Plans</TabsTrigger>
            )}
            <TabsTrigger value="coachplan" className="flex-1">Coach Plan</TabsTrigger>
          </TabsList>
          <TabsContent value="tracker">
            <DailyNutritionLog />
          </TabsContent>
          <TabsContent value="micros">
            <MicronutrientDashboard />
          </TabsContent>
          <TabsContent value="supplements">
            <SupplementLogger />
          </TabsContent>
          {isCoach && (
            <TabsContent value="mealplans">
              <MealPlanBuilder />
            </TabsContent>
          )}
          <TabsContent value="coachplan">
            {isCoach ? <CoachMealPlanUpload /> : <ClientMealPlanView />}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Nutrition;
