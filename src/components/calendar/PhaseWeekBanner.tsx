/**
 * PhaseWeekBanner — Trainerize-style full-width gold strip rendered above
 * a week row when a new program phase begins inside that week.
 *
 * Used by both the coach's client-workspace CalendarTab and the client's
 * own CalendarGrid so phase transitions are unmistakable on every surface.
 */
import { Flag } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export interface WeekPhaseStart {
  startDate: string; // YYYY-MM-DD
  phaseName: string;
  phaseOrder: number;
}

interface Props {
  starts: WeekPhaseStart[];
  className?: string;
}

const PhaseWeekBanner = ({ starts, className }: Props) => {
  if (!starts || starts.length === 0) return null;
  return (
    <div className={cn("flex flex-col gap-px", className)}>
      {starts.map((s) => {
        // Parse local YYYY-MM-DD safely (no UTC drift)
        const [y, m, d] = s.startDate.split("-").map(Number);
        const dt = new Date(y, (m || 1) - 1, d || 1);
        return (
          <div
            key={`${s.phaseOrder}-${s.startDate}`}
            className="bg-primary text-primary-foreground px-3 py-1.5 flex items-center gap-2 rounded-md shadow-sm"
            title={`${s.phaseName} starts ${format(dt, "EEEE, MMM d")}`}
          >
            <Flag className="h-3.5 w-3.5 shrink-0" />
            <span className="text-[11px] md:text-xs font-bold uppercase tracking-wider truncate">
              {s.phaseName}
            </span>
            <span className="text-[10px] md:text-[11px] font-semibold uppercase tracking-wide opacity-80 ml-auto shrink-0">
              Starts {format(dt, "EEE MMM d")}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default PhaseWeekBanner;
