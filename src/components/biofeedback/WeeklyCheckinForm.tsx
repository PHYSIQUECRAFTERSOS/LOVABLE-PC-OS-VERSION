import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const METRICS = [
  { key: "sleep_quality", label: "Sleep Quality", emoji: "😴" },
  { key: "stress_level", label: "Stress Level", emoji: "😰" },
  { key: "energy_level", label: "Energy Level", emoji: "⚡" },
  { key: "digestion", label: "Digestion", emoji: "🍽️" },
  { key: "libido", label: "Libido", emoji: "🔥" },
  { key: "mood", label: "Mood", emoji: "😊" },
] as const;

const WeeklyCheckinForm = ({ onSubmitted }: { onSubmitted?: () => void }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [ratings, setRatings] = useState<Record<string, number>>({
    sleep_quality: 5, stress_level: 5, energy_level: 5,
    digestion: 5, libido: 5, mood: 5,
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!user) return;
    setLoading(true);

    const { error } = await supabase.from("weekly_checkins").insert({
      client_id: user.id,
      weight: weight ? parseFloat(weight) : null,
      sleep_quality: ratings.sleep_quality,
      stress_level: ratings.stress_level,
      energy_level: ratings.energy_level,
      digestion: ratings.digestion,
      libido: ratings.libido,
      mood: ratings.mood,
      notes: notes || null,
    });

    // Also log weight if provided
    if (weight && !error) {
      await supabase.from("weight_logs").upsert({
        client_id: user.id,
        weight: parseFloat(weight),
      }, { onConflict: "client_id,logged_at" });
    }

    setLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Check-in submitted! 💪" });
      onSubmitted?.();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" /> Weekly Check-In
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <Label>Current Weight (lbs/kg)</Label>
          <Input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="e.g. 185.5" />
        </div>

        {METRICS.map(({ key, label, emoji }) => (
          <div key={key} className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{emoji} {label}</Label>
              <span className="text-sm font-bold text-primary">{ratings[key]}/10</span>
            </div>
            <Slider
              value={[ratings[key]]}
              onValueChange={([val]) => setRatings(prev => ({ ...prev, [key]: val }))}
              min={1}
              max={10}
              step={1}
              className="w-full"
            />
          </div>
        ))}

        <div>
          <Label>Notes / How are you feeling?</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything your coach should know..." rows={3} />
        </div>

        <Button onClick={handleSubmit} disabled={loading} className="w-full">
          {loading ? "Submitting..." : "Submit Check-In"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default WeeklyCheckinForm;
