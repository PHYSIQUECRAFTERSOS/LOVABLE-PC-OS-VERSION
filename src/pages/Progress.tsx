import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import WeeklyCheckinForm from "@/components/biofeedback/WeeklyCheckinForm";
import MeasurementsForm from "@/components/biofeedback/MeasurementsForm";
import ProgressPhotoUpload from "@/components/biofeedback/ProgressPhotoUpload";
import PhotoTimeline from "@/components/biofeedback/PhotoTimeline";
import WeightTracker from "@/components/biofeedback/WeightTracker";
import BiofeedbackTrends from "@/components/biofeedback/BiofeedbackTrends";

const Progress = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey(k => k + 1);

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <h1 className="font-display text-2xl font-bold text-foreground">Progress</h1>

        <Tabs defaultValue="checkin" className="w-full">
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="checkin">Check-In</TabsTrigger>
            <TabsTrigger value="weight">Weight</TabsTrigger>
            <TabsTrigger value="photos">Photos</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
          </TabsList>

          <TabsContent value="checkin" className="space-y-6 mt-4">
            <WeeklyCheckinForm onSubmitted={refresh} />
            <MeasurementsForm onSubmitted={refresh} />
          </TabsContent>

          <TabsContent value="weight" className="mt-4">
            <WeightTracker key={refreshKey} />
          </TabsContent>

          <TabsContent value="photos" className="space-y-6 mt-4">
            <ProgressPhotoUpload onUploaded={refresh} />
            <PhotoTimeline key={refreshKey} />
          </TabsContent>

          <TabsContent value="trends" className="mt-4">
            <BiofeedbackTrends key={refreshKey} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Progress;
