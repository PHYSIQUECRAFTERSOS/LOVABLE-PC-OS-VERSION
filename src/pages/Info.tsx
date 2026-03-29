import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dumbbell, UtensilsCrossed, Camera, MessageCircle, ClipboardCheck, Trophy, ArrowRight, CheckCircle2, Shield } from "lucide-react";
import { Link } from "react-router-dom";

const steps = [
  { number: "01", title: "Apply for Coaching", desc: "Submit your application. Spots are limited — you must be accepted before gaining access." },
  { number: "02", title: "Follow Your Plan", desc: "Your coach assigns personalized workouts, nutrition targets, and weekly check-ins — all inside the app." },
  { number: "03", title: "Track & Improve", desc: "Log progress photos, body stats, and compete in ranked challenges to stay accountable." },
];

const features = [
  { icon: Dumbbell, title: "Personalized Training", desc: "Custom programs built by your coach with sets, reps, tempo, and rest — updated in real time." },
  { icon: UtensilsCrossed, title: "Nutrition Tracking", desc: "Daily macro logging, meal plans, food database search, and barcode scanning." },
  { icon: Camera, title: "Progress Photos", desc: "Secure photo uploads with timeline comparison and AI body composition estimates." },
  { icon: MessageCircle, title: "Direct Messaging", desc: "Real-time chat with your coach — voice notes, attachments, and read receipts." },
  { icon: ClipboardCheck, title: "Weekly Check-Ins", desc: "Structured check-in forms covering weight, sleep, stress, energy, and more." },
  { icon: Trophy, title: "Ranked Challenges", desc: "Compete on leaderboards, earn XP, unlock tier badges, and climb the ranks." },
];

const screenshots = [
  { src: "/screenshots/iphone-1.png", alt: "Coach's plan delivered daily" },
  { src: "/screenshots/iphone-2.png", alt: "Workout logging with rest timer" },
  { src: "/screenshots/iphone-3.png", alt: "Weight tracking transformation" },
  { src: "/screenshots/iphone-4.png", alt: "Weekly schedule planned by coach" },
];

const Info = () => {
  return (
    <div className="h-full overflow-y-auto bg-background text-foreground">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <span className="text-lg font-bold tracking-tight">
            <span className="text-primary">Physique</span> Crafters
          </span>
          <Link to="/auth">
            <Button variant="outline" size="sm">Sign In</Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden px-5 pb-20 pt-16 md:pt-24">
        <div className="mx-auto max-w-6xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary">
            <Shield className="h-3.5 w-3.5" /> Application-Only Coaching Platform
          </div>
          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight md:text-6xl lg:text-7xl">
            Your Body. Your Coach.{" "}
            <span className="text-primary">One App.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground md:text-lg">
            The all-in-one platform for serious physique transformation. Personalized training, nutrition, and accountability — delivered by your coach, tracked by you.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <a href="https://bit.ly/LOSETHEGUT" target="_blank" rel="noopener noreferrer">
              <Button size="lg" className="gap-2 text-base font-semibold px-8">
                Apply Now <ArrowRight className="h-4 w-4" />
              </Button>
            </a>
            <Link to="/auth">
              <Button variant="ghost" size="lg" className="text-muted-foreground">
                Already a client? Sign in
              </Button>
            </Link>
          </div>
        </div>

        {/* Phone mockup */}
        <div className="mx-auto mt-14 max-w-[280px]">
          <img
            src="/screenshots/iphone-1.png"
            alt="Physique Crafters app preview"
            className="w-full rounded-2xl shadow-2xl shadow-primary/10"
            loading="eager"
          />
        </div>
      </section>

      {/* How It Works */}
      <section className="border-t border-border/40 bg-card/50 px-5 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-2xl font-bold md:text-3xl">How It Works</h2>
          <p className="mx-auto mt-2 max-w-lg text-center text-sm text-muted-foreground">
            Three steps to a coached transformation.
          </p>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {steps.map((s) => (
              <div key={s.number} className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-xl font-bold text-primary">
                  {s.number}
                </div>
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-5 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-2xl font-bold md:text-3xl">Everything You Need</h2>
          <p className="mx-auto mt-2 max-w-lg text-center text-sm text-muted-foreground">
            A complete coaching OS — training, nutrition, messaging, and accountability in one place.
          </p>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <Card key={f.title} className="border-border/40 bg-card">
                <CardContent className="p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <f.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="mt-4 font-semibold">{f.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Screenshots */}
      <section className="border-t border-border/40 bg-card/50 px-5 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-2xl font-bold md:text-3xl">See It in Action</h2>
          <div className="mt-10 flex gap-5 overflow-x-auto pb-4 no-scrollbar justify-start">
            {screenshots.map((s) => (
              <div key={s.alt} className="flex-shrink-0 w-52 md:w-60">
                <img src={s.src} alt={s.alt} className="w-full rounded-xl shadow-lg" loading="lazy" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-5 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold md:text-3xl">Ready to Transform?</h2>
          <p className="mt-3 text-muted-foreground">
            Apply for coaching and get access to the full platform. Limited spots available.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <a href="https://bit.ly/LOSETHEGUT" target="_blank" rel="noopener noreferrer">
              <Button size="lg" className="gap-2 px-8 font-semibold">
                Apply Now <ArrowRight className="h-4 w-4" />
              </Button>
            </a>
            <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Application-based</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 px-5 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-center text-xs text-muted-foreground sm:flex-row sm:justify-between sm:text-left">
          <span>© {new Date().getFullYear()} Physique Crafters LLC. All rights reserved.</span>
          <div className="flex gap-5">
            <Link to="/pricing" className="hover:text-foreground transition-colors">Programs & Pricing</Link>
            <Link to="/privacy-policy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link to="/terms-of-service" className="hover:text-foreground transition-colors">Terms of Service</Link>
            <Link to="/support" className="hover:text-foreground transition-colors">Support</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Info;
