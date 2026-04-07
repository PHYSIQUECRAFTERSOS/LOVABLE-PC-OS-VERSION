import { useState, useRef, useCallback } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

interface Props {
  title: string;
  body: string;
  onAcknowledge: () => void;
}

const DocumentViewer = ({ title, body, onAcknowledge }: Props) => {
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (atBottom && !hasScrolledToBottom) {
      setHasScrolledToBottom(true);
    }
  }, [hasScrolledToBottom]);

  // Scroll progress indicator
  const [scrollProgress, setScrollProgress] = useState(0);
  const handleScrollWithProgress = useCallback(() => {
    handleScroll();
    const el = scrollRef.current;
    if (!el) return;
    const progress = el.scrollTop / (el.scrollHeight - el.clientHeight);
    setScrollProgress(Math.min(progress * 100, 100));
  }, [handleScroll]);

  const renderContent = () => {
    const lines = body.split("\n");
    return lines.map((line, i) => {
      const trimmed = line.trim();
      if (!trimmed) return <div key={i} className="h-3" />;

      // Main title
      if (i === 0 || (trimmed === trimmed.toUpperCase() && trimmed.length > 10 && !trimmed.startsWith("•"))) {
        return (
          <h2 key={i} className="text-primary font-display text-lg font-bold mt-6 mb-2 tracking-wide">
            {trimmed}
          </h2>
        );
      }

      // Numbered sections
      if (/^\d+\.\s/.test(trimmed)) {
        return (
          <h3 key={i} className="text-primary/90 font-display text-base font-semibold mt-5 mb-2">
            {trimmed}
          </h3>
        );
      }

      // Bullet points
      if (trimmed.startsWith("•")) {
        return (
          <p key={i} className="text-foreground/80 text-sm pl-4 py-0.5">
            {trimmed}
          </p>
        );
      }

      // Date lines
      if (trimmed.startsWith("Effective Date:") || trimmed.startsWith("Last Updated:")) {
        return (
          <p key={i} className="text-muted-foreground text-xs italic">
            {trimmed}
          </p>
        );
      }

      // Section headers (bold key terms)
      if (trimmed.endsWith(":") && trimmed.length < 60) {
        return (
          <p key={i} className="text-foreground/90 text-sm font-semibold mt-3 mb-1">
            {trimmed}
          </p>
        );
      }

      return (
        <p key={i} className="text-foreground/75 text-sm leading-relaxed">
          {trimmed}
        </p>
      );
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col max-h-[calc(100dvh-12rem)] sm:max-h-[70vh]">
      {/* Scroll progress bar */}
      <div className="h-1 bg-muted shrink-0">
        <div
          className="h-full bg-primary transition-all duration-150"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>

      {/* Header */}
      <div className="px-5 py-3 border-b border-border shrink-0">
        <h2 className="font-display text-lg font-bold text-primary tracking-wide">{title}</h2>
      </div>

      {/* Scrollable content — fills remaining space */}
      <div
        ref={scrollRef}
        onScroll={handleScrollWithProgress}
        className="flex-1 min-h-0 overflow-y-auto px-5 py-4 overscroll-contain"
      >
        {renderContent()}
        <div className="h-4" />
      </div>

      {/* Footer — always visible */}
      <div className="px-5 py-3 border-t border-border space-y-2 shrink-0">
        {!hasScrolledToBottom && (
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ChevronDown className="h-3.5 w-3.5 animate-bounce" />
            Scroll to the bottom to continue
          </div>
        )}

        <div className="flex items-start gap-2">
          <Checkbox
            id="acknowledge"
            checked={acknowledged}
            disabled={!hasScrolledToBottom}
            onCheckedChange={(checked) => setAcknowledged(!!checked)}
          />
          <label
            htmlFor="acknowledge"
            className={`text-sm leading-tight ${
              hasScrolledToBottom ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            I have read and understand this document
          </label>
        </div>

        <Button
          onClick={onAcknowledge}
          disabled={!acknowledged}
          className="w-full gap-2"
        >
          <Check className="h-4 w-4" />
          Continue
        </Button>
      </div>
    </div>
  );
};

export default DocumentViewer;
