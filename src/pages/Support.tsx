import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Mail, MessageCircle, HelpCircle, Send, Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

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
    a: "All billing is handled outside of the Physique Crafters app. Please contact your coach or email us for billing inquiries.",
  },
];

const Support = () => {
  const { toast } = useToast();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!firstName.trim() || !lastName.trim() || !email.trim() || !message.trim()) {
      toast({ title: "Please fill in all fields", variant: "destructive" });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: "Please enter a valid email", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("submit-contact", {
        body: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          message: message.trim(),
        },
      });

      if (error) throw error;

      setSent(true);
      setFirstName("");
      setLastName("");
      setEmail("");
      setMessage("");
      toast({ title: "Message sent! We'll get back to you soon." });
    } catch (err: any) {
      console.error("[Support] Submit error:", err);
      toast({
        title: "Failed to send",
        description: "Please try emailing us directly at kevinwu@physiquecrafter.com",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-12 space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Support</h1>
          <p className="text-muted-foreground">
            Need help with Physique Crafters? We're here for you.
          </p>
        </div>

        {/* Contact Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Send className="h-5 w-5 text-primary" />
              Contact Us
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <CheckCircle2 className="h-12 w-12 text-primary" />
                <h3 className="text-lg font-semibold text-foreground">Message Sent!</h3>
                <p className="text-sm text-muted-foreground">
                  We typically respond within 24 hours. Check your email for a reply.
                </p>
                <Button variant="outline" size="sm" onClick={() => setSent(false)} className="mt-2">
                  Send Another Message
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="John"
                      maxLength={100}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Doe"
                      maxLength={100}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="john@example.com"
                    maxLength={255}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="message">Message</Label>
                  <Textarea
                    id="message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="How can we help you?"
                    rows={4}
                    maxLength={5000}
                    required
                  />
                </div>
                <Button type="submit" disabled={sending} className="w-full gap-2">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {sending ? "Sending..." : "Send Message"}
                </Button>
              </form>
            )}

            <div className="mt-4 pt-4 border-t border-border text-center">
              <p className="text-xs text-muted-foreground mb-1">Or email us directly:</p>
              <a
                href="mailto:kevinwu@physiquecrafter.com"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline font-medium"
              >
                <Mail className="h-3.5 w-3.5" />
                kevinwu@physiquecrafter.com
              </a>
            </div>
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
