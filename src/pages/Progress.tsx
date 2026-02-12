import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const Progress = () => {
  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <h1 className="font-display text-2xl font-bold text-foreground">Progress</h1>
        <Card>
          <CardHeader>
            <CardTitle>Biofeedback & Check-ins</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Your progress photos, measurements, and biofeedback trends will appear here.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Progress;
