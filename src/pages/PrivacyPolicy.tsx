import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="font-display text-lg font-bold text-foreground">Privacy Policy</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <p className="text-xs text-muted-foreground italic">Last Updated: March 14, 2026</p>

        <section className="space-y-3">
          <h2 className="text-primary font-display text-base font-semibold">1. Information We Collect</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Physique Crafters collects information you provide directly, including: name, email address, age, gender,
            height, weight, body measurements, progress photos, nutrition logs, training data, health device data
            (via Apple Health or Google Fit integration), and messaging content with your coach.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-primary font-display text-base font-semibold">2. How We Use Your Data</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Your data is used exclusively to: personalize your training and nutrition programs, track your progress,
            enable communication with your coach, generate performance analytics, and improve our coaching services.
            We do not sell, rent, or share your personal data with third parties for marketing purposes.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-primary font-display text-base font-semibold">3. Health & Fitness Data</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Health and fitness data (weight, body fat, measurements, steps, heart rate, sleep) is encrypted at rest
            and in transit. This data is never shared between users. Health device integrations (Apple Health, Google Fit)
            are optional and can be disconnected at any time. We access only the specific data types you authorize.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-primary font-display text-base font-semibold">4. Photos & Media</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Progress photos are stored securely in private storage buckets. They are accessible only to you and your
            assigned coach. Photos are never used for marketing, training AI models, or shared publicly without
            your explicit written consent.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-primary font-display text-base font-semibold">5. Messaging Data</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Messages between you and your coach are stored securely and accessible only to the participants.
            Automated messages may be sent based on your program schedule and compliance patterns.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-primary font-display text-base font-semibold">6. Data Storage & Security</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            All data is stored on secure, encrypted servers. We use industry-standard encryption (TLS 1.3 in transit,
            AES-256 at rest). Access to your data is restricted to authorized personnel only. We conduct regular
            security audits and follow GDPR-compliant and HIPAA-conscious data handling practices.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-primary font-display text-base font-semibold">7. Data Retention & Deletion</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Your data is retained for the duration of your active coaching relationship plus 90 days. You may request
            complete deletion of your data at any time by contacting your coach or emailing privacy@physiquecrafters.com.
            Upon request, all personal data will be permanently deleted within 30 days.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-primary font-display text-base font-semibold">8. Your Rights</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            You have the right to: access your personal data, request correction of inaccurate data, request deletion
            of your data, export your data in a portable format, withdraw consent for optional data processing,
            and opt out of automated messaging.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-primary font-display text-base font-semibold">9. Third-Party Services</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            We use the following third-party services: cloud hosting for data storage, payment processing for
            subscriptions, and optional health device integrations. Each service is bound by data processing
            agreements that meet our privacy standards.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-primary font-display text-base font-semibold">10. Contact</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            For privacy inquiries, data requests, or concerns, contact: privacy@physiquecrafters.com
          </p>
        </section>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
