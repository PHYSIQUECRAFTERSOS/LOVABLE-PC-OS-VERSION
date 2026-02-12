import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const Nutrition = () => {
  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <h1 className="font-display text-2xl font-bold text-foreground">Nutrition</h1>
        <Card>
          <CardHeader>
            <CardTitle>Today's Macros</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Your macro tracking and meal plans will appear here.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Nutrition;
