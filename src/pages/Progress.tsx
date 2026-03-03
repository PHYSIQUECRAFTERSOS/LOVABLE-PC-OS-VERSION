import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import WeeklyCheckinForm from "@/components/checkin/WeeklyCheckinForm";
import MeasurementsForm from "@/components/biofeedback/MeasurementsForm";
import ProgressPhotoUpload from "@/components/biofeedback/ProgressPhotoUpload";
import PhotoTimeline from "@/components/biofeedback/PhotoTimeline";
import PhotoComparisonSlider from "@/components/biofeedback/PhotoComparisonSlider";
import ProgressMetricsDashboard from "@/components/biofeedback/ProgressMetricsDashboard";
import BodyFatEstimation from "@/components/biofeedback/BodyFatEstimation";
import WeightTracker from "@/components/biofeedback/WeightTracker";
import BiofeedbackTrends from "@/components/biofeedback/BiofeedbackTrends";
import CheckinFormBuilder from "@/components/checkin/CheckinFormBuilder";
import CheckinSubmissionForm from "@/components/checkin/CheckinSubmissionForm";
import CheckinReviewDashboard from "@/components/checkin/CheckinReviewDashboard";

const Progress = () => {
  const { role } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey(k => k + 1);
  const isCoach = role === "coach" || role === "admin";

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <h1 className="font-display text-2xl font-bold text-foreground">Progress</h1>

        <Tabs defaultValue="checkin" className="w-full">
          <TabsList className="w-full grid grid-cols-6">
            <TabsTrigger value="checkin">Check-In</TabsTrigger>
            <TabsTrigger value="forms">Forms</TabsTrigger>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="weight">Weight</TabsTrigger>
            <TabsTrigger value="photos">Photos</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
          </TabsList>

          <TabsContent value="checkin" className="space-y-6 mt-4">
            {isCoach ? (
              <CheckinReviewDashboard />
            ) : (
              <>
                <WeeklyCheckinForm onSubmitted={refresh} />
                <MeasurementsForm onSubmitted={refresh} />
              </>
            )}
          </TabsContent>

          <TabsContent value="forms" className="space-y-6 mt-4">
            {isCoach ? (
              <CheckinFormBuilder />
            ) : (
              <CheckinSubmissionForm />
            )}
          </TabsContent>

          <TabsContent value="dashboard" className="mt-4">
            <ProgressMetricsDashboard key={refreshKey} />
          </TabsContent>

          <TabsContent value="weight" className="mt-4">
            <WeightTracker key={refreshKey} />
          </TabsContent>

          <TabsContent value="photos" className="space-y-6 mt-4">
            <ProgressPhotoUpload onUploaded={refresh} />
            <Tabs defaultValue="gallery" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="gallery">Gallery</TabsTrigger>
                <TabsTrigger value="compare">Comparison</TabsTrigger>
                <TabsTrigger value="bodyfat">AI Body Fat</TabsTrigger>
              </TabsList>
              <TabsContent value="gallery" className="mt-4">
                <PhotoTimeline key={refreshKey} />
              </TabsContent>
              <TabsContent value="compare" className="mt-4">
                <PhotoComparisonSlider key={refreshKey} />
              </TabsContent>
              <TabsContent value="bodyfat" className="mt-4">
                <BodyFatEstimation key={refreshKey} />
              </TabsContent>
            </Tabs>
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
