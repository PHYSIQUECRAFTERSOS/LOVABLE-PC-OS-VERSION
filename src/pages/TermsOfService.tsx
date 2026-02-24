import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const TermsOfService = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="font-display text-lg font-bold text-foreground">Terms of Service</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <p className="text-xs text-muted-foreground italic">Last Updated: February 24, 2026</p>

        <section className="space-y-3">
          <h2 className="text-primary font-display text-base font-semibold">1. Acceptance of Terms</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            By accessing and using the Physique Crafters application, you accept and agree to be bound by these
            Terms of Service. If you do not agree, you may not use the application.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-primary font-display text-base font-semibold">2. Service Description</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Physique Crafters provides personalized fitness and nutrition coaching through a digital platform.
            The service includes customized training programs, nutrition guidance, progress tracking, and
            direct communication with assigned coaches.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-primary font-display text-base font-semibold">3. Medical Disclaimer</h2>
          <p className="text-sm text-foreground/80 leading-relaxed font-medium">
            Physique Crafters is NOT a medical service and does NOT provide medical advice, diagnosis, or treatment.
            All content, programs, and recommendations are for informational and educational purposes only.
            You should consult a qualified healthcare professional before beginning any fitness or nutrition program.
            If you experience any pain, discomfort, or adverse reaction, stop immediately and seek medical attention.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-primary font-display text-base font-semibold">4. Eligibility</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            You must be at least 18 years old to use this service. Access is by invitation only from authorized
            Physique Crafters coaches.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-primary font-display text-base font-semibold">5. User Responsibilities</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            You agree to: provide accurate personal and health information, follow programs responsibly,
            report injuries or adverse reactions immediately, not share your program with others,
            and complete check-ins as scheduled.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-primary font-display text-base font-semibold">6. Results Disclaimer</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Results vary based on individual effort, adherence, genetics, and other factors. Physique Crafters
            does not guarantee specific results. Any testimonials or transformations shown represent individual
            outcomes and are not guaranteed.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-primary font-display text-base font-semibold">7. Payment Terms</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Subscription fees are charged according to the plan selected at enrollment. Subscriptions auto-renew
            unless cancelled before the renewal date. Cancellation policies as agreed at time of purchase apply.
            Refunds are handled on a case-by-case basis.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-primary font-display text-base font-semibold">8. Intellectual Property</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            All training programs, meal plans, and content provided through Physique Crafters are proprietary
            and may not be copied, distributed, or shared without written permission.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-primary font-display text-base font-semibold">9. Limitation of Liability</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Physique Crafters, its coaches, employees, and affiliates shall not be liable for any injuries,
            damages, or losses arising from your use of the service. You assume all risks associated with
            participating in fitness and nutrition programs.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-primary font-display text-base font-semibold">10. Termination</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            We reserve the right to suspend or terminate your access for violation of these terms, non-payment,
            or conduct that endangers the community.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-primary font-display text-base font-semibold">11. Contact</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            For questions about these terms, contact: support@physiquecrafters.com
          </p>
        </section>
      </div>
    </div>
  );
};

export default TermsOfService;
