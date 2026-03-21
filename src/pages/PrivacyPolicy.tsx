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
          <h2 className="text-primary font-display text-base font-semibold">9a. Apple In-App Purchases</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Subscription payments are processed securely through Apple's In-App Purchase system. Physique Crafters
            does not collect, store, or have access to your credit card or Apple ID payment details. All payment
            processing is handled entirely by Apple. For information about how Apple handles your payment data,
            please refer to Apple's Privacy Policy at{" "}
            <a
              href="https://www.apple.com/legal/privacy/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              https://www.apple.com/legal/privacy/
            </a>.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-primary font-display text-base font-semibold">9b. Camera and Photo Library</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            The app requests access to your device camera to take progress photos and profile pictures. The app
            requests access to your photo library to upload existing photos. These permissions are optional. You can
            grant or revoke camera and photo access at any time through your device Settings. The app will function
            without these permissions, but photo features will be unavailable.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-primary font-display text-base font-semibold">10. Health Device Integrations</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Physique Crafters offers optional integrations with third-party health and fitness platforms,
            including <strong>Fitbit</strong> and <strong>Google Fit</strong>. When you connect a health device or
            platform, we may access the following data types with your explicit authorization:
          </p>
          <ul className="text-sm text-foreground/80 leading-relaxed list-disc pl-6 space-y-1">
            <li>Daily step count</li>
            <li>Heart rate (resting and active)</li>
            <li>Sleep duration and quality</li>
            <li>Active minutes and activity data</li>
            <li>Calories burned</li>
          </ul>
          <p className="text-sm text-foreground/80 leading-relaxed">
            This data is used <strong>exclusively</strong> to personalize your coaching program, track your fitness
            progress, and provide analytics to your assigned coach. Health data from connected devices is:
          </p>
          <ul className="text-sm text-foreground/80 leading-relaxed list-disc pl-6 space-y-1">
            <li>Never sold to third parties</li>
            <li>Never used for advertising or marketing purposes</li>
            <li>Never shared with insurance companies, employers, or data brokers</li>
            <li>Accessible only to you and your assigned coach</li>
          </ul>
          <p className="text-sm text-foreground/80 leading-relaxed">
            You may disconnect any health integration at any time via the Settings page. Upon disconnection,
            your OAuth tokens are immediately deleted. Previously synced health data remains in your account
            unless you request full data deletion.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-primary font-display text-base font-semibold">11. Google API Limited Use Disclosure</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Physique Crafters' use and transfer of information received from Google APIs adheres to the{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements. Specifically:
          </p>
          <ul className="text-sm text-foreground/80 leading-relaxed list-disc pl-6 space-y-1">
            <li>We only request access to the data types necessary to provide coaching services (fitness activity, steps, heart rate, sleep).</li>
            <li>We do not use Google user data for serving advertisements.</li>
            <li>We do not allow humans to read your Google data unless: (a) we have your affirmative consent, (b) it is necessary for security purposes, (c) it is necessary to comply with applicable law, or (d) our use is limited to internal operations and the data has been aggregated and anonymized.</li>
            <li>We do not transfer Google user data to third parties except as necessary to provide or improve our coaching services, as required by law, or as part of a merger/acquisition with equivalent privacy protections.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-primary font-display text-base font-semibold">12. Fitbit API Data Disclosure</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Data accessed via the Fitbit Web API is used solely to support your personalized coaching program.
            We comply with{" "}
            <a
              href="https://dev.fitbit.com/legal/platform-terms-of-service/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              Fitbit's Platform Terms of Service
            </a>
            . Your Fitbit data is never sold, shared for advertising, or used for any purpose beyond fitness coaching
            and progress tracking. You may revoke Fitbit access at any time through your Physique Crafters settings
            or directly through your Fitbit account settings.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-primary font-display text-base font-semibold">13. Health Data Token Storage</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            When you connect a health platform, we store encrypted OAuth access tokens and refresh tokens to
            maintain your connection. These tokens grant limited, scoped access to your health data as authorized.
            Tokens are automatically refreshed as needed and are permanently deleted when you disconnect the
            integration. We do not store your health platform passwords.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-primary font-display text-base font-semibold">14. Contact</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            For privacy inquiries, data requests, or concerns, contact: privacy@physiquecrafters.com
          </p>
        </section>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
