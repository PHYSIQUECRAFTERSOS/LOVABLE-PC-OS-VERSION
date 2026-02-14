import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, ReferenceLine,
} from "recharts";
import {
  Activity, Loader2, Sparkles, AlertTriangle, CheckCircle, Edit3, ChevronLeft, ChevronRight, ImageIcon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Photo {
  id: string;
  storage_path: string;
  pose: string;
  photo_date: string;
  url?: string;
}

interface Estimate {
  id: string;
  estimated_bf_pct: number;
  confidence_low: number;
  confidence_high: number;
  ai_notes: string | null;
  lighting_warning: boolean;
  coach_override_pct: number | null;
  coach_notes: string | null;
  coach_id: string | null;
  photo_ids: string[];
  created_at: string;
}

const BodyFatEstimation = () => {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const isCoach = role === "coach" || role === "admin";

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [latestResult, setLatestResult] = useState<{
    estimated_bf_pct: number;
    confidence_low: number;
    confidence_high: number;
    ai_notes: string;
    lighting_warning: boolean;
  } | null>(null);

  // Coach override state
  const [editingOverride, setEditingOverride] = useState<string | null>(null);
  const [overrideValue, setOverrideValue] = useState("");
  const [overrideNotes, setOverrideNotes] = useState("");

  // Comparison state
  const [comparisonEstimateIndex, setComparisonEstimateIndex] = useState<number | null>(null);
  const [comparisonPhotos, setComparisonPhotos] = useState<Photo[]>([]);

  // Fetch photos
  useEffect(() => {
    if (!user) return;
    const fetchPhotos = async () => {
      const { data } = await supabase
        .from("progress_photos")
        .select("*")
        .eq("client_id", user.id)
        .order("photo_date", { ascending: false })
        .limit(30);

      if (data && data.length > 0) {
        const enriched = await Promise.all(
          (data as Photo[]).map(async (p) => {
            const { data: urlData } = await supabase.storage
              .from("progress-photos")
              .createSignedUrl(p.storage_path, 3600);
            return { ...p, url: urlData?.signedUrl || "" };
          })
        );
        setPhotos(enriched);
        // Auto-select latest front/back/side photos
        const latestFront = enriched.find(p => p.pose === "front");
        const latestBack = enriched.find(p => p.pose === "back");
        const latestSide = enriched.find(p => p.pose.includes("side"));
        const autoSelected = [latestFront, latestBack, latestSide].filter(Boolean).map(p => p!.id);
        setSelectedPhotoIds(autoSelected.length > 0 ? autoSelected : enriched.slice(0, 3).map(p => p.id));
      }
    };
    fetchPhotos();
  }, [user]);

  // Fetch estimates
  useEffect(() => {
    if (!user) return;
    const fetchEstimates = async () => {
      const { data } = await supabase
        .from("ai_body_fat_estimates")
        .select("*")
        .eq("client_id", user.id)
        .order("created_at", { ascending: true });

      if (data) setEstimates(data as unknown as Estimate[]);
    };
    fetchEstimates();
  }, [user]);

  const togglePhotoSelection = (id: string) => {
    setSelectedPhotoIds(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const runEstimation = async () => {
    if (selectedPhotoIds.length === 0) {
      toast({ title: "Select photos", description: "Please select at least one photo for analysis.", variant: "destructive" });
      return;
    }
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("estimate-body-fat", {
        body: { photoIds: selectedPhotoIds },
      });
      if (error) throw error;
      if (data?.error) {
        toast({ title: "Error", description: data.error, variant: "destructive" });
      } else {
        setLatestResult(data.estimate);
        // Refresh estimates
        const { data: updated } = await supabase
          .from("ai_body_fat_estimates")
          .select("*")
          .eq("client_id", user!.id)
          .order("created_at", { ascending: true });
        if (updated) setEstimates(updated as unknown as Estimate[]);
        toast({ title: "Analysis complete! 🎯" });
      }
    } catch (e: any) {
      toast({ title: "Analysis failed", description: e.message, variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  const saveOverride = async (estimateId: string) => {
    const val = parseFloat(overrideValue);
    if (isNaN(val) || val < 1 || val > 60) {
      toast({ title: "Invalid value", description: "Enter a body fat % between 1 and 60.", variant: "destructive" });
      return;
    }
    const { error } = await supabase
      .from("ai_body_fat_estimates")
      .update({
        coach_override_pct: val,
        coach_notes: overrideNotes || null,
        coach_id: user!.id,
      })
      .eq("id", estimateId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Override saved ✅" });
      setEditingOverride(null);
      // Refresh
      const { data: updated } = await supabase
        .from("ai_body_fat_estimates")
        .select("*")
        .eq("client_id", user!.id)
        .order("created_at", { ascending: true });
      if (updated) setEstimates(updated as unknown as Estimate[]);
    }
  };

  // Load comparison photos for a specific estimate
  const loadComparisonPhotos = async (estimate: Estimate, idx: number) => {
    if (comparisonEstimateIndex === idx) {
      setComparisonEstimateIndex(null);
      setComparisonPhotos([]);
      return;
    }
    const matchedPhotos = photos.filter(p => estimate.photo_ids.includes(p.id));
    setComparisonPhotos(matchedPhotos);
    setComparisonEstimateIndex(idx);
  };

  // Chart data
  const chartData = estimates.map(e => ({
    date: format(new Date(e.created_at), "MMM d"),
    bf: e.coach_override_pct ?? e.estimated_bf_pct,
    low: e.confidence_low,
    high: e.confidence_high,
    aiEstimate: e.estimated_bf_pct,
  }));

  const latestEstimate = estimates.length > 0 ? estimates[estimates.length - 1] : null;
  const effectiveBf = latestEstimate
    ? (latestEstimate.coach_override_pct ?? latestEstimate.estimated_bf_pct)
    : null;

  return (
    <div className="space-y-6">
      {/* Current Estimate Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Current Estimate</p>
                <p className="text-3xl font-bold">
                  {effectiveBf !== null ? `${Number(effectiveBf).toFixed(1)}%` : "—"}
                </p>
                {latestEstimate?.coach_override_pct && (
                  <p className="text-xs text-muted-foreground">Coach override (AI: {latestEstimate.estimated_bf_pct}%)</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Confidence Range</p>
            <p className="text-2xl font-bold">
              {latestEstimate ? `${latestEstimate.confidence_low}–${latestEstimate.confidence_high}%` : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {latestEstimate ? `±${((latestEstimate.confidence_high - latestEstimate.confidence_low) / 2).toFixed(1)}%` : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Trend</p>
            {estimates.length >= 2 ? (
              <>
                <p className="text-2xl font-bold">
                  {(() => {
                    const prev = estimates[estimates.length - 2];
                    const curr = estimates[estimates.length - 1];
                    const prevVal = prev.coach_override_pct ?? prev.estimated_bf_pct;
                    const currVal = curr.coach_override_pct ?? curr.estimated_bf_pct;
                    const diff = Number(currVal) - Number(prevVal);
                    return `${diff > 0 ? "+" : ""}${diff.toFixed(1)}%`;
                  })()}
                </p>
                <p className="text-xs text-muted-foreground">vs previous estimate</p>
              </>
            ) : (
              <p className="text-2xl font-bold">—</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Warnings */}
      {latestResult?.lighting_warning && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <p className="text-sm">Lighting inconsistency detected. Consider retaking photos with consistent lighting for more accurate estimates.</p>
          </CardContent>
        </Card>
      )}

      {/* Trend Chart */}
      {chartData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Body Fat % Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="bfGradEst" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis domain={["dataMin - 2", "dataMax + 2"]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Area type="monotone" dataKey="high" stroke="none" fill="hsl(var(--primary))" fillOpacity={0.08} />
                <Area type="monotone" dataKey="low" stroke="none" fill="hsl(var(--background))" fillOpacity={1} />
                <Line type="monotone" dataKey="bf" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 4, fill: "hsl(var(--primary))" }} name="Body Fat %" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Photo Selection & Analysis */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" /> AI Body Fat Analysis
            </CardTitle>
            <Button onClick={runEstimation} disabled={analyzing || selectedPhotoIds.length === 0} size="sm">
              {analyzing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
              {analyzing ? "Analyzing..." : "Run Analysis"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Select photos to analyze (front, back, and side recommended):</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {photos.slice(0, 15).map((photo) => (
              <button
                key={photo.id}
                onClick={() => togglePhotoSelection(photo.id)}
                className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                  selectedPhotoIds.includes(photo.id)
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-border hover:border-primary/40"
                }`}
              >
                <img
                  src={photo.url}
                  alt={`${photo.pose} pose`}
                  className="w-full aspect-[3/4] object-cover"
                  loading="lazy"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1">
                  <p className="text-[10px] text-white capitalize">{photo.pose.replace("-", " ")}</p>
                  <p className="text-[9px] text-white/70">{format(new Date(photo.photo_date), "MMM d")}</p>
                </div>
                {selectedPhotoIds.includes(photo.id) && (
                  <div className="absolute top-1 right-1">
                    <CheckCircle className="h-5 w-5 text-primary drop-shadow-md" />
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Latest Result */}
          {latestResult && (
            <Card className="bg-muted/50">
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-lg">{latestResult.estimated_bf_pct}%</span>
                  <span className="text-sm text-muted-foreground">
                    (range: {latestResult.confidence_low}–{latestResult.confidence_high}%)
                  </span>
                </div>
                <p className="text-sm">{latestResult.ai_notes}</p>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      {/* Estimate History with Coach Override & Comparison */}
      {estimates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Estimation History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[...estimates].reverse().map((est, idx) => {
              const realIdx = estimates.length - 1 - idx;
              return (
                <div key={est.id} className="border border-border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {est.coach_override_pct
                          ? `${est.coach_override_pct}% (coach)`
                          : `${est.estimated_bf_pct}%`}
                        <span className="text-sm text-muted-foreground ml-2">
                          range: {est.confidence_low}–{est.confidence_high}%
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">{format(new Date(est.created_at), "PPP")}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => loadComparisonPhotos(est, realIdx)}
                      >
                        <ImageIcon className="h-4 w-4 mr-1" />
                        {comparisonEstimateIndex === realIdx ? "Hide" : "Photos"}
                      </Button>
                      {isCoach && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingOverride(editingOverride === est.id ? null : est.id);
                            setOverrideValue(est.coach_override_pct?.toString() || "");
                            setOverrideNotes(est.coach_notes || "");
                          }}
                        >
                          <Edit3 className="h-4 w-4 mr-1" /> Override
                        </Button>
                      )}
                    </div>
                  </div>

                  {est.ai_notes && (
                    <p className="text-sm text-muted-foreground">{est.ai_notes}</p>
                  )}

                  {est.lighting_warning && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Lighting inconsistency detected
                    </p>
                  )}

                  {est.coach_override_pct && est.coach_notes && (
                    <p className="text-sm italic text-muted-foreground">Coach notes: {est.coach_notes}</p>
                  )}

                  {/* Coach Override Form */}
                  {editingOverride === est.id && (
                    <div className="border-t pt-3 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Override BF %</Label>
                          <Input
                            type="number"
                            step="0.1"
                            value={overrideValue}
                            onChange={(e) => setOverrideValue(e.target.value)}
                            placeholder={est.estimated_bf_pct.toString()}
                          />
                        </div>
                        <div>
                          <Label>AI Estimate</Label>
                          <p className="text-sm text-muted-foreground mt-2">{est.estimated_bf_pct}%</p>
                        </div>
                      </div>
                      <div>
                        <Label>Coach Notes</Label>
                        <Textarea
                          value={overrideNotes}
                          onChange={(e) => setOverrideNotes(e.target.value)}
                          placeholder="Reason for override..."
                          rows={2}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveOverride(est.id)}>Save Override</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingOverride(null)}>Cancel</Button>
                      </div>
                    </div>
                  )}

                  {/* Comparison Photos */}
                  {comparisonEstimateIndex === realIdx && comparisonPhotos.length > 0 && (
                    <div className="border-t pt-3">
                      <p className="text-sm font-medium mb-2">Photos used for this estimate:</p>
                      <div className="grid grid-cols-3 gap-2">
                        {comparisonPhotos.map(p => (
                          <div key={p.id} className="rounded-lg overflow-hidden border border-border">
                            <img src={p.url} alt={p.pose} className="w-full aspect-[3/4] object-cover" loading="lazy" />
                            <div className="px-2 py-1 bg-muted">
                              <p className="text-[10px] capitalize">{p.pose.replace("-", " ")}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {comparisonEstimateIndex === realIdx && comparisonPhotos.length === 0 && (
                    <div className="border-t pt-3">
                      <p className="text-sm text-muted-foreground">Photos for this estimate are no longer available.</p>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {photos.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <ImageIcon className="h-10 w-10 mx-auto opacity-30 mb-2" />
            <p>Upload progress photos first to use AI body fat estimation.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BodyFatEstimation;
