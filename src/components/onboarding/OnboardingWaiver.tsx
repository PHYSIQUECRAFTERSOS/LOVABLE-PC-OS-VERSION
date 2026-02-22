import { useState, useRef, useCallback, useEffect } from "react";
import type { OnboardingData } from "@/pages/Onboarding";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { ShieldCheck, Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  data: OnboardingData;
  updateField: <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => void;
  validationErrors: Record<string, string>;
}

const WAIVER_TEXT = `PHYSIQUE CRAFTERS — LIABILITY WAIVER & COACHING AGREEMENT

Effective Date: ${new Date().toLocaleDateString()}

1. ASSUMPTION OF RISK
I understand that participation in any fitness or nutrition coaching program involves inherent risks, including but not limited to physical injury, muscle soreness, fatigue, and other potential health complications. I voluntarily assume all risks associated with my participation.

2. MEDICAL CLEARANCE
I confirm that I am in good physical health and have consulted with a physician regarding my ability to participate in a fitness program. I have disclosed any and all medical conditions, injuries, or limitations to my coach through the onboarding questionnaire.

3. LIABILITY RELEASE
I hereby release Physique Crafters, its coaches, employees, and affiliates from any and all liability, claims, demands, or causes of action arising from my participation in the coaching program, including any injuries sustained during exercise.

4. COACHING GUIDELINES
I agree to:
• Follow my prescribed training and nutrition plan to the best of my ability
• Communicate honestly and promptly with my coach
• Report any pain, injury, or adverse reaction immediately
• Not share my program or meal plans with others
• Complete weekly check-ins as scheduled

5. PROGRAM USE
I understand that:
• My program is personalized and should not be shared or distributed
• Results vary based on individual effort, adherence, and genetics
• Physique Crafters does not guarantee specific results
• My coach may modify my program based on my progress and feedback

6. PAYMENT & CANCELLATION
I agree to the payment terms outlined at enrollment. Cancellation policies as agreed upon at the time of purchase apply.

7. DATA & PRIVACY
My personal information, progress photos, and health data will be kept confidential and used solely for coaching purposes. Data handling follows our Privacy Policy.

8. ACKNOWLEDGMENT
By signing below, I confirm that I have read, understood, and agree to all terms outlined in this waiver. I am signing this agreement voluntarily and of my own free will.`;

const OnboardingWaiver = ({ data, updateField, validationErrors }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (atBottom) setHasScrolledToBottom(true);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Set canvas resolution
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.strokeStyle = "hsl(43, 72%, 55%)";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const getPos = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasSignature(true);
  };

  const endDraw = () => {
    setIsDrawing(false);
    if (hasSignature && canvasRef.current) {
      const dataUrl = canvasRef.current.toDataURL("image/png");
      updateField("waiver_signature", dataUrl);
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    setHasSignature(false);
    updateField("waiver_signature", "");
  };

  const handleAcceptToggle = (checked: boolean) => {
    updateField("waiver_signed", checked);
    if (checked) {
      updateField("waiver_signed_at", new Date().toISOString());
    } else {
      updateField("waiver_signed_at", "");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <ShieldCheck className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">Digital Waiver & Agreement</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Please read the agreement below, sign, and confirm before proceeding.
          </p>
        </div>
      </div>

      {/* Waiver text - scrollable */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="rounded-xl border border-border bg-card p-4 max-h-64 overflow-y-auto overscroll-contain"
      >
        {WAIVER_TEXT.split("\n").map((line, i) => {
          const trimmed = line.trim();
          if (!trimmed) return <div key={i} className="h-2" />;
          if (/^\d+\.\s/.test(trimmed)) {
            return <h3 key={i} className="text-primary/90 font-display text-sm font-semibold mt-4 mb-1">{trimmed}</h3>;
          }
          if (trimmed.startsWith("•")) {
            return <p key={i} className="text-foreground/75 text-xs pl-3 py-0.5">{trimmed}</p>;
          }
          if (trimmed.startsWith("PHYSIQUE")) {
            return <h2 key={i} className="text-primary font-display text-base font-bold mb-2">{trimmed}</h2>;
          }
          if (trimmed.startsWith("Effective Date:")) {
            return <p key={i} className="text-muted-foreground text-[10px] italic mb-2">{trimmed}</p>;
          }
          return <p key={i} className="text-foreground/70 text-xs leading-relaxed">{trimmed}</p>;
        })}
      </div>

      {!hasScrolledToBottom && (
        <p className="text-xs text-muted-foreground text-center animate-pulse">
          ↓ Scroll to the bottom to continue
        </p>
      )}

      {/* Digital signature */}
      {hasScrolledToBottom && (
        <div className="space-y-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
          <div className="flex items-center justify-between">
            <Label>Digital Signature <span className="text-destructive">*</span></Label>
            {hasSignature && (
              <Button variant="ghost" size="sm" onClick={clearSignature} className="h-7 text-xs gap-1">
                <Eraser className="h-3 w-3" /> Clear
              </Button>
            )}
          </div>
          <div className={cn(
            "rounded-xl border-2 border-dashed bg-card overflow-hidden",
            hasSignature ? "border-primary/40" : "border-border",
            validationErrors.waiver_signature && "border-destructive"
          )}>
            <canvas
              ref={canvasRef}
              className="w-full h-24 touch-none cursor-crosshair"
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
          </div>
          {!hasSignature && (
            <p className="text-[10px] text-muted-foreground text-center">Draw your signature above</p>
          )}
          {validationErrors.waiver_signature && (
            <p className="text-xs text-destructive">{validationErrors.waiver_signature}</p>
          )}

          {/* Date */}
          <div className="rounded-lg border border-border bg-card px-4 py-2 flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Date</span>
            <span className="text-sm text-foreground font-medium">{new Date().toLocaleDateString()}</span>
          </div>

          {/* Acceptance checkbox */}
          <label className={cn(
            "flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-all",
            data.waiver_signed
              ? "border-primary bg-primary/10 ring-1 ring-primary/30"
              : "border-border bg-card",
            validationErrors.waiver_signed && "border-destructive"
          )}>
            <Checkbox
              checked={data.waiver_signed || false}
              onCheckedChange={(checked) => handleAcceptToggle(!!checked)}
              className="mt-0.5"
            />
            <span className="text-sm text-foreground leading-relaxed">
              I have read and agree to the terms outlined in the Physique Crafters Liability Waiver & Coaching Agreement.
            </span>
          </label>
          {validationErrors.waiver_signed && (
            <p className="text-xs text-destructive">{validationErrors.waiver_signed}</p>
          )}
        </div>
      )}
    </div>
  );
};

export default OnboardingWaiver;
