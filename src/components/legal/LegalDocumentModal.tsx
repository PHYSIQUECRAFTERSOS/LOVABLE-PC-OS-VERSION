import { useState, useRef, useCallback } from "react";
import { X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LegalDocumentModalProps {
  open: boolean;
  onClose: () => void;
  onAccept: () => void;
  title: string;
  content: string;
}

const LegalDocumentModal = ({ open, onClose, onAccept, title, content }: LegalDocumentModalProps) => {
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Consider "bottom" when within 40px of the end
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (atBottom && !hasScrolledToBottom) {
      setHasScrolledToBottom(true);
    }
  }, [hasScrolledToBottom]);

  const handleAccept = () => {
    onAccept();
    // Reset for next open
    setHasScrolledToBottom(false);
  };

  const handleClose = () => {
    onClose();
    setHasScrolledToBottom(false);
  };

  if (!open) return null;

  // Parse content into styled sections
  const renderContent = () => {
    const lines = content.split("\n");
    return lines.map((line, i) => {
      const trimmed = line.trim();
      if (!trimmed) return <div key={i} className="h-3" />;

      // Main title (first line or all caps multi-word)
      if (i === 0 || (trimmed === trimmed.toUpperCase() && trimmed.length > 10 && !trimmed.startsWith("•"))) {
        return (
          <h2 key={i} className="text-primary font-display text-lg font-bold mt-6 mb-2 tracking-wide">
            {trimmed}
          </h2>
        );
      }

      // Numbered sections (e.g., "1. ACCEPTANCE OF TERMS")
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

      // Regular text
      return (
        <p key={i} className="text-foreground/75 text-sm leading-relaxed">
          {trimmed}
        </p>
      );
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div className="relative z-10 w-full sm:max-w-lg h-[90vh] sm:h-[80vh] bg-card border border-border rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="font-display text-lg font-bold text-primary tracking-wide">{title}</h2>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-full hover:bg-secondary transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Scrollable content */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-5 py-4 overscroll-contain"
        >
          {renderContent()}
          {/* Scroll sentinel */}
          <div className="h-4" />
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-4 border-t border-border bg-card">
          {!hasScrolledToBottom && (
            <p className="text-xs text-muted-foreground text-center mb-3">
              Please scroll to the bottom to accept
            </p>
          )}
          <Button
            onClick={handleAccept}
            disabled={!hasScrolledToBottom}
            className="w-full gap-2"
          >
            <Check className="h-4 w-4" />
            I Accept
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LegalDocumentModal;
