import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, MessageCircle, HelpCircle } from "lucide-react";

const faqs = [
  {
    q: "How do I create an account?",
    a: "Accounts are created by invitation only. Your coach will send you an email invite with a link to set up your account.",
  },
  {
    q: "How do I log my workouts?",
    a: "Go to the Training tab on your dashboard. Tap on your assigned workout for today, log your sets, reps, and weight, then tap Finish Workout.",
  },
  {
    q: "How do I track my nutrition?",
    a: "Navigate to the Nutrition tab. You can search for foods, scan barcodes, or use the meal scan camera to log your meals.",
  },
  {
    q: "How do I upload progress photos?",
    a: "Go to the Progress tab and tap Upload Photo. Select a pose type, then choose a photo from your gallery.",
  },
  {
    q: "How do I message my coach?",
    a: "Tap the Messages tab in the bottom navigation to open your conversation with your coach.",
  },
  {
    q: "I forgot my password. How do I reset it?",
    a: 'On the login screen, tap "Forgot password?" and enter your email. You\'ll receive a link to reset your password.',
  },
  {
    q: "How do I cancel or manage my coaching subscription?",
    a: "All billing is handled outside of the app through the Physique Crafters website. Please contact your coach or email us for billing inquiries.",
  },
];

const Support = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-12 space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Support</h1>
          <p className="text-muted-foreground">
            Need help with Physique Crafters? We're here for you.
          </p>
        </div>

        {/* Contact */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Mail className="h-5 w-5 text-primary" />
              Contact Us
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              For questions, issues, or feedback, email us at:
            </p>
            <a
              href="mailto:kevinwu@physiquecrafter.com"
              className="inline-flex items-center gap-2 text-primary hover:underline font-medium"
            >
              <MessageCircle className="h-4 w-4" />
              kevinwu@physiquecrafter.com
            </a>
            <p className="text-muted-foreground">
              We typically respond within 24 hours.
            </p>
          </CardContent>
        </Card>

        {/* FAQ */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <HelpCircle className="h-5 w-5 text-primary" />
              Frequently Asked Questions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {faqs.map((faq, i) => (
              <div key={i} className="space-y-1">
                <h3 className="font-medium text-foreground">{faq.q}</h3>
                <p className="text-sm text-muted-foreground">{faq.a}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Physique Crafters. All rights reserved.
        </p>
      </div>
    </div>
  );
};

export default Support;
