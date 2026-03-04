import { format, addDays, subDays, isToday } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DateNavigatorProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}

const DateNavigator = ({ selectedDate, onDateChange }: DateNavigatorProps) => {
  const days = Array.from({ length: 7 }, (_, i) => addDays(subDays(selectedDate, 3), i));

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => onDateChange(subDays(selectedDate, 1))}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="flex gap-1 overflow-x-auto scrollbar-hide flex-1 justify-center">
        {days.map((day) => {
          const active = format(day, "yyyy-MM-dd") === format(selectedDate, "yyyy-MM-dd");
          return (
            <button
              key={day.toISOString()}
              onClick={() => onDateChange(day)}
              className={cn(
                "flex flex-col items-center px-2.5 py-1.5 rounded-lg text-center transition-colors min-w-[3rem]",
                active ? "bg-primary text-primary-foreground" : "hover:bg-secondary text-muted-foreground"
              )}
            >
              <span className="text-[10px] font-medium uppercase">{format(day, "EEE")}</span>
              <span className={cn("text-sm font-bold", active ? "" : "text-foreground")}>{format(day, "d")}</span>
              {isToday(day) && <div className={cn("h-1 w-1 rounded-full mt-0.5", active ? "bg-primary-foreground" : "bg-primary")} />}
            </button>
          );
        })}
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => onDateChange(addDays(selectedDate, 1))}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default DateNavigator;
