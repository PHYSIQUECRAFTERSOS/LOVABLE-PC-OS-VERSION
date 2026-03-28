import { useState, useRef, useCallback } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SwipeToDeleteProps {
  children: React.ReactNode;
  onDelete: () => void;
  className?: string;
}

const THRESHOLD = 80;

const SwipeToDelete = ({ children, onDelete, className }: SwipeToDeleteProps) => {
  const [offset, setOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const locked = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const directionDecided = useRef(false);
  const isHorizontal = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    locked.current = false;
    directionDecided.current = false;
    isHorizontal.current = false;
    setSwiping(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swiping) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    // Decide direction once with a 10px dead zone
    if (!directionDecided.current) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return; // still in dead zone
      directionDecided.current = true;
      isHorizontal.current = Math.abs(dx) > Math.abs(dy);
      if (!isHorizontal.current) {
        // Vertical scroll — abort swipe entirely
        setSwiping(false);
        setOffset(0);
        return;
      }
    }

    if (!isHorizontal.current) return;

    if (dx < 0) {
      setOffset(Math.max(dx, -140));
    }
  }, [swiping]);

  const handleTouchEnd = useCallback(() => {
    setSwiping(false);
    if (offset < -THRESHOLD) {
      setOffset(-140);
    } else {
      setOffset(0);
    }
  }, [offset]);

  const handleDeleteClick = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setOffset(0);
    void onDelete();
  };

  // Reset swipe on click (when not swiped)
  const handleClick = () => {
    if (offset < -10) {
      setOffset(0);
    }
  };

  return (
    <div className={cn("relative overflow-hidden", className)} ref={containerRef} style={{ touchAction: "pan-y" }}>
      {/* Delete button behind */}
      <div
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-destructive text-destructive-foreground cursor-pointer"
        style={{ width: 140 }}
        onClick={(e) => handleDeleteClick(e)}
      >
        <div className="flex items-center gap-2 font-medium text-sm">
          <Trash2 className="h-4 w-4" />
          Delete
        </div>
      </div>

      {/* Foreground content */}
      <div
        className="relative bg-card"
        style={{
          transform: `translateX(${offset}px)`,
          transition: swiping ? "none" : "transform 0.25s ease-out",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
      >
        {children}
      </div>
    </div>
  );
};

export default SwipeToDelete;
