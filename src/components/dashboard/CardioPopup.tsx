import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Drawer, DrawerContent, DrawerFooter } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Check, Footprints, Bike, Activity } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useXPAward } from "@/hooks/useXPAward";
import { XP_VALUES } from "@/utils/rankedXP";
import { useQueryClient } from "@tanstack/react-query";

const CARDIO_ICONS: Record<string, React.ReactNode> = {
  walking: <Footprints className="h-6 w-6 text-white" />,
  "incline walk": <Footprints className="h-6 w-6 text-white" />,
  running: <Activity className="h-6 w-6 text-white" />,
  bike: <Bike className="h-6 w-6 text-white" />,
  cycling: <Bike className="h-6 w-6 text-white" />,
  stairmaster: <Activity className="h-6 w-6 text-white" />,
  rowing: <Activity className="h-6 w-6 text-white" />,
};

function getCardioIcon(title: string) {
  const lower = title.toLowerCase();
  for (const [key, icon] of Object.entries(CARDIO_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return <Activity className="h-6 w-6 text-white" />;
}

function getCardioTypeName(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes("walk")) return "Walking";
  if (lower.includes("run")) return "Running";
  if (lower.includes("bike") || lower.includes("cycl")) return "Cycling";
  if (lower.includes("stair")) return "StairMaster";
  if (lower.includes("row")) return "Rowing";
  return "Cardio";
}

function buildDetailLine(title: string, description?: string | null): string {
  const parts: string[] = [];
  const combined = `${title} ${description || ""}`;

  const inclineMatch = combined.match(/incline\s*([\d.]+)/i);
  if (inclineMatch) parts.push(`Incline ${inclineMatch[1]}`);

  const speedMatch = combined.match(/speed\s*([\d.]+)\s*mph/i);
  if (speedMatch) parts.push(`Speed ${speedMatch[1]}mph`);

  const levelMatch = combined.match(/level\s*([\d]+)\+?/i);
  if (levelMatch) parts.push(`Level ${levelMatch[1]}+`);

  const durationMatch = combined.match(/(\d+)\s*(?:min(?:utes?)?|m\b)/i);
  if (durationMatch) parts.push(`${durationMatch[1]} minutes`);

  const distanceMatch = combined.match(/([\d.]+)\s*(?:km|miles?)/i);
  if (distanceMatch) parts.push(`${distanceMatch[0]}`);

  return parts.join("  •  ") || "Complete your cardio session";
}

interface CardioPopupProps {
  open: boolean;
  onClose: () => void;
  eventId: string;
  title: string;
  description?: string | null;
  onCompleted: () => void;
}

const CardioPopup = ({ open, onClose, eventId, title, description, onCompleted }: CardioPopupProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { triggerXP } = useXPAward();
  const queryClient = useQueryClient();
  const [completing, setCompleting] = useState(false);

  const handleComplete = async () => {
    setCompleting(true);
    try {
      const { error } = await supabase
        .from("calendar_events")
        .update({ is_completed: true, completed_at: new Date().toISOString() })
        .eq("id", eventId);

      if (error) throw error;

      // Award Ranked XP (fire-and-forget)
      if (user?.id) {
        triggerXP(user.id, "cardio_completed", XP_VALUES.cardio_completed, "Completed cardio: " + title).catch(console.error);
      }

      // Haptic
      if (navigator.vibrate) navigator.vibrate([50, 30, 80]);

      // Close popup immediately, then trigger dashboard refresh
      onClose();
      onCompleted();

      // Dispatch event so dashboard ring + TodayActions refetch instantly
      window.dispatchEvent(new CustomEvent("calendar-event-added"));
      // Invalidate rank/XP queries so the dashboard card updates
      queryClient.invalidateQueries({ queryKey: ["my-rank"] });
      queryClient.invalidateQueries({ queryKey: ["xp-today"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setCompleting(false);
    }
  };

  const typeName = getCardioTypeName(title);
  const detailLine = buildDetailLine(title, description);

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent>
        <div className="flex flex-col items-center py-8 px-4 space-y-4">
          <div className="h-16 w-16 rounded-2xl bg-green-500/20 border-2 border-green-500/40 flex items-center justify-center">
            {getCardioIcon(title)}
          </div>

          <div className="text-center space-y-1.5">
            <h2 className="text-xl font-bold text-foreground">{typeName}</h2>
            <p className="text-sm text-muted-foreground">Scheduled</p>
            <p className="text-sm text-muted-foreground">{detailLine}</p>
          </div>
        </div>

        <DrawerFooter className="flex-row gap-3" data-vaul-no-drag>
          <Button
            variant="outline"
            className="flex-1"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            onClick={(e) => { e.stopPropagation(); handleComplete(); }}
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            disabled={completing}
          >
            <Check className="h-4 w-4 mr-1" /> Mark as Complete
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};

export default CardioPopup;
