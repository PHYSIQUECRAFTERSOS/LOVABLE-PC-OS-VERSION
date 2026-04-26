import * as React from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/**
 * MobileTwoPane
 * --------------
 * Wraps the existing desktop "list-on-left, detail-on-right" layout used by
 * Master Library sub-tabs (Programs, Meals, Supplement Plans).
 *
 * Desktop (md+): renders [list][detail] side-by-side, exactly like before.
 * Mobile (<md):  renders the list full-width. When `selected` becomes truthy,
 *                a full-screen right-side Sheet slides in containing `detail`,
 *                with a sticky back-button header. Closing the sheet calls
 *                `onClose` so the parent can clear its selection state.
 *
 * The wrapper does NOT duplicate the parent's data fetching or state — it
 * only re-arranges existing nodes. This keeps each sub-tab's logic intact
 * and avoids regression risk on desktop.
 */
interface MobileTwoPaneProps {
  /** The list pane (always rendered). */
  list: React.ReactNode;
  /** The detail pane (rendered on the right on desktop, inside a Sheet on mobile). */
  detail: React.ReactNode;
  /** Whether anything is currently selected (drives the mobile Sheet open state). */
  selected: boolean;
  /** Called when the user closes the mobile Sheet (e.g. tapping back). */
  onClose: () => void;
  /** Title shown in the mobile Sheet header. */
  detailTitle?: string;
  /** Empty-state node for desktop right pane when nothing is selected. Hidden on mobile. */
  emptyState?: React.ReactNode;
  /** Width class for the list (desktop only). Default: w-80. */
  listWidthClass?: string;
  /** Optional className on the outer container (desktop full-height container). */
  className?: string;
}

const MobileTwoPane: React.FC<MobileTwoPaneProps> = ({
  list,
  detail,
  selected,
  onClose,
  detailTitle,
  emptyState,
  listWidthClass = "w-80",
  className,
}) => {
  const isMobile = useIsMobile();

  // ── MOBILE: full-width list, detail in slide-in Sheet ──
  if (isMobile) {
    return (
      <>
        <div className={cn("flex flex-col w-full min-w-0 overflow-x-hidden", className)}>
          {list}
        </div>
        <Sheet open={selected} onOpenChange={(open) => { if (!open) onClose(); }}>
          <SheetContent
            side="right"
            className="w-full sm:max-w-full p-0 flex flex-col gap-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
          >
            {/* Sticky back header */}
            <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-background/95 backdrop-blur">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 -ml-2"
                onClick={onClose}
                aria-label="Back to list"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              {detailTitle && (
                <h2 className="flex-1 min-w-0 text-base font-semibold text-foreground truncate">
                  {detailTitle}
                </h2>
              )}
            </div>
            {/* Scrollable detail body */}
            <div className="flex-1 overflow-y-auto">
              {detail}
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  // ── DESKTOP: original two-pane layout ──
  return (
    <div className={cn("h-[calc(100vh-12rem)]", className)}>
      <div className="flex h-full">
        <div className={cn("border-r flex flex-col flex-shrink-0", listWidthClass)}>
          {list}
        </div>
        <div className="flex-1 overflow-auto">
          {selected ? detail : emptyState}
        </div>
      </div>
    </div>
  );
};

export default MobileTwoPane;
