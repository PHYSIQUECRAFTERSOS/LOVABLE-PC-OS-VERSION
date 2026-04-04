import { useState, useRef, useCallback, useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface PhotoLightboxProps {
  src: string;
  alt?: string;
  open: boolean;
  onClose: () => void;
}

const DISMISS_THRESHOLD = 120;

const PhotoLightbox = ({ src, alt = "Photo", open, onClose }: PhotoLightboxProps) => {
  const [offsetY, setOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [open]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    const delta = e.touches[0].clientY - startY.current;
    setOffsetY(delta);
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    if (Math.abs(offsetY) > DISMISS_THRESHOLD) {
      onClose();
    }
    setOffsetY(0);
  }, [offsetY, onClose]);

  // Mouse drag for desktop
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    startY.current = e.clientY;
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const delta = e.clientY - startY.current;
    setOffsetY(delta);
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    if (Math.abs(offsetY) > DISMISS_THRESHOLD) {
      onClose();
    }
    setOffsetY(0);
  }, [isDragging, offsetY, onClose]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === containerRef.current) {
      onClose();
    }
  }, [onClose]);

  if (!open) return null;

  const opacity = Math.max(0.3, 1 - Math.abs(offsetY) / 400);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[80] flex items-center justify-center"
      style={{ backgroundColor: `rgba(0,0,0,${opacity})` }}
      onClick={handleBackdropClick}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-[81] p-2 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors safe-top"
        style={{ marginTop: "env(safe-area-inset-top, 0px)" }}
        aria-label="Close"
      >
        <X className="h-6 w-6" />
      </button>

      {/* Image with drag transform */}
      <img
        src={src}
        alt={alt}
        className={cn(
          "max-w-[95vw] max-h-[90vh] object-contain rounded-lg select-none",
          isDragging ? "" : "transition-transform duration-200 ease-out"
        )}
        style={{ transform: `translateY(${offsetY}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        draggable={false}
      />
    </div>
  );
};

export default PhotoLightbox;
