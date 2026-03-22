import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Drawer, DrawerContent, DrawerFooter, DrawerClose } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Check, Footprints, Bike, Activity } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useXPAward } from "@/hooks/useXPAward";
import { XP_VALUES } from "@/utils/rankedXP";
import CardioIcon from "@/assets/Cardio_icon.png";
import ConfettiBurst from "@/components/workout/ConfettiBurst";

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
  const { triggerXP, triggerCelebration } = useXPAward();
  const [completing, setCompleting] = useState(false);
  const [celebrationState, setCelebrationState] = useState(false);
  const [xpEarned, setXpEarned] = useState(0);
  const [displayXP, setDisplayXP] = useState(0);

  const handleComplete = async () => {
    setCompleting(true);
    try {
      const { error } = await supabase
        .from("calendar_events")
        .update({ is_completed: true, completed_at: new Date().toISOString() })
        .eq("id", eventId);

      if (error) throw error;

      let earned = XP_VALUES.cardio_completed;

      // Award Ranked XP
      if (user?.id) {
        try {
          const result = await triggerXP(user.id, "cardio_completed", XP_VALUES.cardio_completed, "Completed cardio: " + title);
          // triggerXP doesn't return a value currently, use base amount
        } catch (e) {
          console.error("[CardioPopup] Ranked XP error:", e);
        }
      }

      // Transition to celebration state
      setXpEarned(earned);
      setCelebrationState(true);

      // Haptic
      if (navigator.vibrate) navigator.vibrate([50, 30, 80]);

      // Animate XP counter
      const duration = 800;
      const start = performance.now();
      const tick = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplayXP(Math.round(eased * earned));
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);

      // Auto-close after 3.5s
      setTimeout(() => {
        onCompleted();
        onClose();
        setCelebrationState(false);
        setDisplayXP(0);
      }, 3500);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setCompleting(false);
    }
  };

  const typeName = getCardioTypeName(title);
  const detailLine = buildDetailLine(title, description);

  return (
    <Drawer open={open} onOpenChange={(o) => !o && !celebrationState && onClose()}>
      <DrawerContent>
        {celebrationState ? (
          /* ── Celebration State ── */
          <div className="relative flex flex-col items-center py-10 px-4 space-y-5 overflow-hidden">
            <ConfettiBurst fire={true} />

            {/* Icon with pulse */}
            <style>{`
              @keyframes cardioPulse {
                0%, 100% { transform: scale(1); filter: drop-shadow(0 0 12px hsl(43, 72%, 55%)); }
                50% { transform: scale(1.15); filter: drop-shadow(0 0 24px hsl(43, 80%, 65%)); }
              }
              @keyframes cardioBounceIn {
                0% { transform: scale(0.2); opacity: 0; }
                60% { transform: scale(1.2); opacity: 1; }
                100% { transform: scale(1); opacity: 1; }
              }
              @keyframes xpShimmerCardio {
                0% { background-position: -200% 0; }
                100% { background-position: 200% 0; }
              }
              @keyframes checkScale {
                0% { transform: scale(0); }
                60% { transform: scale(1.3); }
                100% { transform: scale(1); }
              }
            `}</style>

            {/* Checkmark burst */}
            <div
              className="absolute top-4 right-4 h-8 w-8 rounded-full bg-emerald-500 flex items-center justify-center"
              style={{ animation: "checkScale 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards" }}
            >
              <Check className="h-5 w-5 text-white" />
            </div>

            {/* Cardio icon */}
            <div style={{ animation: "cardioBounceIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards" }}>
              <div
                className="h-24 w-24 rounded-2xl bg-primary/10 border-2 border-primary/40 flex items-center justify-center overflow-hidden"
                style={{ animation: "cardioPulse 2s ease-in-out 0.6s infinite" }}
              >
                <img src={CardioIcon} alt="Cardio" className="h-16 w-16 object-contain" />
              </div>
            </div>

            {/* Type name */}
            <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {typeName} Complete!
            </p>

            {/* XP counter */}
            <span
              className="text-4xl font-black"
              style={{
                background: "linear-gradient(135deg, hsl(145, 63%, 42%), hsl(43, 80%, 65%))",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundSize: "200% 100%",
                animation: "xpShimmerCardio 2s linear infinite",
              }}
            >
              +{displayXP} XP
            </span>

            <p className="text-xs text-muted-foreground">Cardio session completed 🎉</p>
          </div>
        ) : (
          /* ── Default State ── */
          <>
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

            <DrawerFooter className="flex-row gap-3">
              <DrawerClose asChild>
                <Button variant="outline" className="flex-1">Cancel</Button>
              </DrawerClose>
              <Button
                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                onClick={handleComplete}
                disabled={completing}
              >
                <Check className="h-4 w-4 mr-1" /> Mark as Complete
              </Button>
            </DrawerFooter>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
};

export default CardioPopup;
