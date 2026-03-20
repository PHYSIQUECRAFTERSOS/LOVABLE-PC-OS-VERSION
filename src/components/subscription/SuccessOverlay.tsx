import { useNavigate } from "react-router-dom";
import { CheckCircle, Dumbbell, UtensilsCrossed, MessageSquare, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SuccessOverlayProps {
  planName: string;
  onDismiss?: () => void;
}

const features = [
  { icon: Dumbbell, text: "Full access to your training programs" },
  { icon: UtensilsCrossed, text: "Custom meal plans and nutrition tracking" },
  { icon: MessageSquare, text: "Direct messaging with your coach" },
  { icon: TrendingUp, text: "Progress photos and body stats tracking" },
];

const SuccessOverlay = ({ planName, onDismiss }: SuccessOverlayProps) => {
  const navigate = useNavigate();

  const handleGetStarted = () => {
    onDismiss?.();
    navigate("/dashboard");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 animate-fade-in">
      <div className="mx-4 max-w-sm w-full rounded-2xl border border-primary/30 bg-card p-8 text-center space-y-6">
        {/* Animated checkmark */}
        <div className="flex justify-center animate-[bounce-in_0.5s_ease-out_0.2s_both]">
          <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center">
            <CheckCircle className="h-10 w-10 text-primary" />
          </div>
        </div>

        {/* Title */}
        <div className="space-y-2 animate-[fade-in_0.3s_ease-out_0.5s_both]">
          <h2 className="text-xl font-bold text-foreground">Welcome to Physique Crafters!</h2>
          <p className="text-sm text-muted-foreground">
            Your <span className="text-primary font-semibold">{planName}</span> subscription is now active.
          </p>
        </div>

        {/* Feature list */}
        <div className="space-y-3 text-left animate-[fade-in_0.3s_ease-out_0.7s_both]">
          {features.map((f) => (
            <div key={f.text} className="flex items-center gap-3">
              <f.icon className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm text-foreground/80">{f.text}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="animate-[fade-in_0.3s_ease-out_0.9s_both]">
          <Button
            onClick={handleGetStarted}
            className="w-full bg-primary text-primary-foreground font-bold hover:bg-primary/90"
          >
            Get Started
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SuccessOverlay;
