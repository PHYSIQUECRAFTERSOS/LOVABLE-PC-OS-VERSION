import { AlertTriangle, Shield, FileText } from "lucide-react";
import { Link } from "react-router-dom";

const OnboardingDisclaimer = () => {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
          <AlertTriangle className="h-4 w-4 text-destructive" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Medical Disclaimer</h3>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">
            Physique Crafters is <strong>not a medical service</strong> and does not provide medical advice,
            diagnosis, or treatment. Always consult a qualified physician before starting any fitness or
            nutrition program, especially if you have pre-existing health conditions.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Shield className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Data Collection Notice</h3>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">
            During onboarding, we collect: body measurements, health metrics, progress photos, training
            preferences, and lifestyle information. This data is used exclusively to personalize your
            coaching program. All data is encrypted and never shared with third parties.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 pt-1">
        <Link
          to="/privacy-policy"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <FileText className="h-3 w-3" />
          Privacy Policy
        </Link>
        <Link
          to="/terms-of-service"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <FileText className="h-3 w-3" />
          Terms of Service
        </Link>
      </div>
    </div>
  );
};

export default OnboardingDisclaimer;
