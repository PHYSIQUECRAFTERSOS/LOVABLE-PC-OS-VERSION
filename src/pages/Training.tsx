import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const Training = () => {
  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <h1 className="font-display text-2xl font-bold text-foreground">Training</h1>
        <Card>
          <CardHeader>
            <CardTitle>Today's Workout</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Your workout program will appear here.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Training;
