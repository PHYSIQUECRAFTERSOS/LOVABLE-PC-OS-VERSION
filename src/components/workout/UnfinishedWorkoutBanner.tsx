import { useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Zap, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import type { ActiveSession } from "@/hooks/useActiveSession";

interface Props {
  session: ActiveSession;
  online: boolean;
  onDismiss: () => void;
}

const UnfinishedWorkoutBanner = ({ session, online, onDismiss }: Props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [finishing, setFinishing] = useState(false);

  // Don't show if already on Training page with active logger
  const isOnTraining = location.pathname === "/training";

  const timeAgo = useMemo(() => {
    const ms = Date.now() - new Date(session.started_at).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `Started ${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `Started ${hrs}h ${remainMins}min ago`;
  }, [session.started_at]);

  if (isOnTraining) return null;

  const handleResume = () => {
    navigate("/training", { state: { resumeSessionId: session.id, startWorkoutId: session.workout_id } });
    onDismiss();
  };

  const handleFinish = () => {
    // Navigate to training with resume state — the workout logger will handle
    // showing the finish flow and summary screen properly
    navigate("/training", { state: { resumeSessionId: session.id, startWorkoutId: session.workout_id } });
    onDismiss();
  };

  return (
    <div className="sticky top-0 z-40 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground px-4 py-3 shadow-lg">
      <div className="flex items-start gap-3 max-w-3xl mx-auto">
        <Zap className="h-5 w-5 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Unfinished Workout</p>
          <p className="text-xs opacity-90 truncate">
            {session.workout_name} · {timeAgo}
          </p>
        </div>
      </div>

      {!online && (
        <p className="text-xs text-center opacity-75 mt-1">Reconnecting… please wait</p>
      )}

      <div className="flex gap-2 mt-2 max-w-3xl mx-auto">
        <Button
          size="sm"
          variant="secondary"
          className="flex-1 bg-background/20 hover:bg-background/30 text-primary-foreground border-0 font-semibold"
          onClick={handleResume}
          disabled={!online}
        >
          Resume Workout
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="flex-1 bg-background text-foreground hover:bg-background/90 font-semibold border-0"
          onClick={handleFinish}
          disabled={!online || finishing}
        >
          {finishing && <Loader2 className="animate-spin mr-1 h-3.5 w-3.5" />}
          Finish Workout
        </Button>
      </div>
    </div>
  );
};

export default UnfinishedWorkoutBanner;
