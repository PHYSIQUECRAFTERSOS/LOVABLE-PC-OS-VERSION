import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { FileText, Download, Camera, AlertTriangle, X } from "lucide-react";
import { format } from "date-fns";

interface Props {
  clientId: string;
}

interface OnboardingData {
  primary_goal: string;
  gender: string;
  age: number | null;
  height_feet: number | null;
  height_inches: number | null;
  height_cm: number | null;
  weight_lb: number | null;
  activity_level: string;
  training_location: string;
  home_equipment_list: string;
  gym_name_address: string;
  wake_time: string;
  workout_time: string;
  sleep_time: string;
  occupation: string;
  foods_love: string;
  foods_dislike: string;
  tracked_macros_before: boolean | null;
  food_intolerances: string[];
  injuries: string;
  surgeries: string;
  workout_days_current: string;
  workout_days_realistic: string;
  available_days: string[];
  motivation_text: string;
  favorite_body_part: string;
  work_on_most: string;
  final_notes: string;
  health_sync_status: string;
  waiver_signed: boolean;
}

interface SignatureRecord {
  id: string;
  document_version: string;
  signed_name: string;
  signed_at: string;
  tier_at_signing: string;
  ip_address: string | null;
  pdf_storage_path: string | null;
  document_templates: { title: string } | null;
}

interface Photo {
  id: string;
  storage_path: string;
  created_at: string;
  signedUrl?: string;
}

const goalLabels: Record<string, string> = {
  lose_fat: "Lose Body Fat",
  build_muscle: "Build Muscle",
  recomposition: "Recomposition",
  improve_energy: "Improve Energy",
  hormone_optimization: "Hormone Optimization",
  other: "Other",
};

const activityLabels: Record<string, string> = {
  sedentary: "Sedentary",
  lightly_active: "Lightly Active",
  moderately_active: "Moderately Active",
  very_active: "Very Active",
};

const OnboardingTab = ({ clientId }: Props) => {
  const [profile, setProfile] = useState<OnboardingData | null>(null);
  const [signatures, setSignatures] = useState<SignatureRecord[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    loadAll();
  }, [clientId]);

  const loadAll = async () => {
    setLoading(true);
    const [profileRes, sigRes, photoRes] = await Promise.all([
      supabase
        .from("onboarding_profiles")
        .select("*")
        .eq("user_id", clientId)
        .maybeSingle(),
      supabase
        .from("client_signatures")
        .select("*, document_templates(title)")
        .eq("client_id", clientId)
        .order("signed_at", { ascending: false }),
      supabase
        .from("progress_photos")
        .select("id, storage_path, created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: true })
        .limit(3),
    ]);

    setProfile(profileRes.data as OnboardingData | null);
    setSignatures((sigRes.data as any[]) || []);

    // Get signed URLs for photos
    const photoData = (photoRes.data as any[]) || [];
    if (photoData.length > 0) {
      const urls = await Promise.all(
        photoData.map(async (p: any) => {
          const { data } = await supabase.storage
            .from("progress-photos")
            .createSignedUrl(p.storage_path, 3600);
          return { ...p, signedUrl: data?.signedUrl || null };
        })
      );
      setPhotos(urls);
    }

    setLoading(false);
  };

  const handleDownloadPdf = async (path: string) => {
    const { data } = await supabase.storage
      .from("signature-records")
      .createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const questionPairs = profile
    ? [
        { q: "Primary Goal", a: goalLabels[profile.primary_goal] || profile.primary_goal },
        { q: "Gender", a: profile.gender ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1) : null },
        { q: "Age", a: profile.age ? `${profile.age} years` : null },
        { q: "Height", a: profile.height_feet != null ? `${profile.height_feet} ft ${profile.height_inches ?? 0} in` : null },
        { q: "Weight", a: profile.weight_lb != null ? `${profile.weight_lb} lbs` : null },
        { q: "Activity Level", a: activityLabels[profile.activity_level] || profile.activity_level },
        { q: "Training Location", a: profile.training_location === "home" ? "Home" : profile.training_location === "gym" ? `Gym — ${profile.gym_name_address}` : profile.training_location },
        ...(profile.home_equipment_list ? [{ q: "Equipment", a: profile.home_equipment_list }] : []),
        { q: "Wake Time", a: profile.wake_time },
        { q: "Workout Time", a: profile.workout_time },
        { q: "Sleep Time", a: profile.sleep_time },
        { q: "Occupation", a: profile.occupation },
        { q: "Foods They Love", a: profile.foods_love },
        { q: "Foods to Avoid", a: profile.foods_dislike },
        { q: "Tracked Macros Before", a: profile.tracked_macros_before === null ? null : profile.tracked_macros_before ? "Yes" : "No" },
        { q: "Current Workout Days", a: profile.workout_days_current },
        { q: "Realistic Workout Days", a: profile.workout_days_realistic },
        { q: "Available Days", a: (profile.available_days || []).join(", ") },
        { q: "Motivation", a: profile.motivation_text },
        { q: "Favorite Body Part", a: profile.favorite_body_part },
        { q: "Focus Area", a: profile.work_on_most },
        ...(profile.injuries ? [{ q: "Injuries", a: profile.injuries }] : []),
        ...(profile.surgeries ? [{ q: "Surgeries", a: profile.surgeries }] : []),
        ...(profile.final_notes ? [{ q: "Final Notes", a: profile.final_notes }] : []),
      ].filter((p) => p.a)
    : [];

  return (
    <div className="space-y-6">
      {/* Section 1: Questionnaire */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Intake Questionnaire</CardTitle>
          <p className="text-xs text-muted-foreground">Answers provided during account setup</p>
        </CardHeader>
        <CardContent>
          {questionPairs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No onboarding questionnaire data found for this client.</p>
          ) : (
            <div className="space-y-0">
              {questionPairs.map((pair, i) => (
                <div key={i}>
                  <div className="flex justify-between items-start py-2.5">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0 max-w-[40%]">
                      {pair.q}
                    </span>
                    <span className="text-xs text-foreground text-right max-w-[58%] leading-relaxed">
                      {pair.a}
                    </span>
                  </div>
                  {i < questionPairs.length - 1 && <Separator />}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Signed Agreements */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Signed Agreements</CardTitle>
        </CardHeader>
        <CardContent>
          {signatures.length === 0 ? (
            <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3">
              <p className="text-sm text-primary flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                This client has not completed document signing yet.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {signatures.map((sig) => (
                <div key={sig.id} className="rounded-lg border border-border p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        {(sig.document_templates as any)?.title || "Document"}
                      </p>
                      <p className="text-xs text-muted-foreground">Version: {sig.document_version}</p>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">{sig.tier_at_signing}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <p>Signed name: <span className="text-foreground">{sig.signed_name}</span></p>
                    <p>Date signed: <span className="text-foreground">{format(new Date(sig.signed_at), "MMMM d, yyyy 'at' h:mm a")}</span></p>
                    {sig.ip_address && <p>IP: {sig.ip_address}</p>}
                  </div>
                  {sig.pdf_storage_path && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs border-primary/30 text-primary hover:text-primary"
                      onClick={() => handleDownloadPdf(sig.pdf_storage_path!)}
                    >
                      <Download className="h-3 w-3" />
                      Download PDF
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Starting Photos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Camera className="h-4 w-4" />
            Starting Progress Photos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {photos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No starting photos uploaded yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((photo) => (
                <button
                  key={photo.id}
                  onClick={() => photo.signedUrl && setLightboxUrl(photo.signedUrl)}
                  className="aspect-square rounded-lg overflow-hidden border border-border bg-card"
                >
                  {photo.signedUrl ? (
                    <img
                      src={photo.signedUrl}
                      alt="Starting photo"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-secondary animate-pulse" />
                  )}
                </button>
              ))}
            </div>
          )}
          {photos.length > 0 && (
            <div className="flex gap-2 mt-2">
              {photos.map((photo) => (
                <p key={photo.id} className="text-[10px] text-muted-foreground flex-1 text-center">
                  Uploaded {format(new Date(photo.created_at), "MMM d, yyyy")}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="absolute top-4 right-4 text-white p-2"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={lightboxUrl}
            alt="Full size"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};

export default OnboardingTab;
