import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, CheckCircle2, ExternalLink, Shield } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface PricingTier {
  name: string;
  duration: string;
  description: string;
  features: string[];
  stripeUrl: string;
  popular?: boolean;
}

const tiers: PricingTier[] = [
  {
    name: "1-Year Program",
    duration: "12 months",
    description: "Maximum transformation — our most committed coaching tier with the best value.",
    features: [
      "Personalized training programs",
      "Custom nutrition targets & meal plans",
      "Weekly check-ins with your coach",
      "Direct messaging with coach",
      "Progress photo tracking & AI body comp",
      "Full app access with ranked challenges",
    ],
    stripeUrl: "https://buy.stripe.com/PLACEHOLDER_1YEAR",
    popular: true,
  },
  {
    name: "6-Month Program",
    duration: "6 months",
    description: "Serious commitment to physique transformation with structured coaching.",
    features: [
      "Personalized training programs",
      "Custom nutrition targets & meal plans",
      "Weekly check-ins with your coach",
      "Direct messaging with coach",
      "Progress photo tracking & AI body comp",
      "Full app access with ranked challenges",
    ],
    stripeUrl: "https://buy.stripe.com/PLACEHOLDER_6MONTH",
  },
  {
    name: "Monthly Program",
    duration: "Month-to-month",
    description: "Flexible monthly coaching — cancel anytime.",
    features: [
      "Personalized training programs",
      "Custom nutrition targets & meal plans",
      "Weekly check-ins with your coach",
      "Direct messaging with coach",
      "Progress photo tracking",
      "Full app access",
    ],
    stripeUrl: "https://buy.stripe.com/PLACEHOLDER_MONTHLY",
  },
  {
    name: "6-Week Program",
    duration: "6 weeks",
    description: "An intensive short-term program for rapid kickstart results.",
    features: [
      "Personalized training programs",
      "Custom nutrition targets",
      "Weekly check-ins with your coach",
      "Direct messaging with coach",
      "Progress photo tracking",
    ],
    stripeUrl: "https://buy.stripe.com/PLACEHOLDER_6WEEK",
  },
];

const Pricing = () => {
  const { user } = useAuth();
  const location = useLocation();
  const isLoggedIn = !!user;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link to={isLoggedIn ? "/dashboard" : "/"} className="text-lg font-bold tracking-tight">
            <span className="text-primary">Physique</span> Crafters
          </Link>
          <div className="flex items-center gap-3">
            {isLoggedIn ? (
              <Link to="/dashboard">
                <Button variant="outline" size="sm">Back to App</Button>
              </Link>
            ) : (
              <Link to="/auth">
                <Button variant="outline" size="sm">Sign In</Button>
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="px-5 pt-16 pb-10 text-center">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary">
            <Shield className="h-3.5 w-3.5" /> Coaching Programs
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight md:text-5xl">
            Programs & Pricing
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground md:text-lg">
            Choose the coaching program that fits your goals. All programs include personalized training, nutrition coaching, and full app access.
          </p>
        </div>
      </section>

      {/* Tiers */}
      <section className="px-5 pb-20">
        <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-2">
          {tiers.map((tier) => (
            <Card
              key={tier.name}
              className={`relative border-border/40 bg-card ${tier.popular ? "ring-2 ring-primary" : ""}`}
            >
              {tier.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                  Most Popular
                </div>
              )}
              <CardContent className="p-6 pt-8">
                <h3 className="text-xl font-bold">{tier.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{tier.duration}</p>
                <p className="mt-3 text-sm text-muted-foreground">{tier.description}</p>

                <ul className="mt-5 space-y-2">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <a
                  href={tier.stripeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 block"
                >
                  <Button className="w-full gap-2 font-semibold" size="lg">
                    Subscribe <ExternalLink className="h-4 w-4" />
                  </Button>
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Apple-compliant disclosure */}
      <section className="border-t border-border/40 px-5 py-10">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Subscriptions are managed and processed externally through our secure payment provider. 
            Physique Crafters coaching programs are digital services delivered through this app. 
            By subscribing, you agree to our{" "}
            <Link to="/terms-of-service" className="underline hover:text-foreground">Terms of Service</Link>
            {" "}and{" "}
            <Link to="/privacy-policy" className="underline hover:text-foreground">Privacy Policy</Link>.
            {" "}For questions or cancellations, contact{" "}
            <a href="mailto:kevinwu@physiquecrafter.com" className="underline hover:text-foreground">
              kevinwu@physiquecrafter.com
            </a>.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 px-5 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-center text-xs text-muted-foreground sm:flex-row sm:justify-between sm:text-left">
          <span>© {new Date().getFullYear()} Physique Crafters LLC. All rights reserved.</span>
          <div className="flex gap-5">
            <Link to="/privacy-policy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link to="/terms-of-service" className="hover:text-foreground transition-colors">Terms of Service</Link>
            <Link to="/support" className="hover:text-foreground transition-colors">Support</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Pricing;
