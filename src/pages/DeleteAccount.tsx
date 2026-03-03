import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout, TIMEOUTS } from "@/lib/performance";
import { AlertTriangle, CheckCircle, Shield, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

const DeleteAccount = () => {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast({ title: "Email required", description: "Please enter your account email.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await withTimeout(
        supabase.functions.invoke("request-account-deletion", {
          body: { source: "public_form", email: email.trim(), full_name: fullName.trim(), reason: reason.trim() },
        }),
        TIMEOUTS.STANDARD_API,
        "public-deletion-request"
      );

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setSubmitted(true);
    } catch (err: any) {
      console.error("[DeleteAccount] Error:", err);
      toast({
        title: "Request failed",
        description: err.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-primary mx-auto" />
            <h2 className="text-xl font-bold text-foreground">Request Received</h2>
            <p className="text-muted-foreground text-sm">
              If an account with that email exists, a confirmation link has been sent. 
              Please check your inbox and follow the link to confirm deletion.
            </p>
            <p className="text-muted-foreground text-xs">
              The confirmation link expires in 24 hours.
            </p>
            <Link to="/" className="text-primary text-sm underline block mt-4">
              Return to home
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-lg w-full space-y-6">
        <div className="text-center space-y-2">
          <Shield className="h-10 w-10 text-primary mx-auto" />
          <h1 className="text-2xl font-bold text-foreground">Account Deletion Request</h1>
          <p className="text-muted-foreground text-sm">
            Physique Crafters — Data Deletion
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Request Account & Data Deletion
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 text-sm text-foreground space-y-2">
              <p className="font-semibold">What will be deleted:</p>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>Profile information and account credentials</li>
                <li>Workout programs and training logs</li>
                <li>Nutrition logs and meal plans</li>
                <li>Progress photos and body measurements</li>
                <li>Messages and conversations</li>
                <li>Calendar events and check-in data</li>
                <li>Community posts and comments</li>
              </ul>
              <p className="font-semibold mt-3">What is retained (anonymized):</p>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>Payment transaction records (anonymized for legal compliance)</li>
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                Deletion is processed within <strong>30 days</strong> of confirmation. 
                This action cannot be undone.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="del-email">Email Address *</Label>
                <Input
                  id="del-email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="del-name">Full Name</Label>
                <Input
                  id="del-name"
                  placeholder="Your full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="del-reason">Reason (optional)</Label>
                <Textarea
                  id="del-reason"
                  placeholder="Let us know why you're leaving..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                />
              </div>
              <Button type="submit" variant="destructive" className="w-full" disabled={loading}>
                {loading && <Loader2 className="animate-spin" />}
                {loading ? "Processing..." : "Submit Deletion Request"}
              </Button>
            </form>

            <div className="border-t pt-4 space-y-2 text-xs text-muted-foreground">
              <p>
                Need help? Contact us at{" "}
                <a href="mailto:support@physiquecrafters.com" className="text-primary underline">
                  support@physiquecrafters.com
                </a>
              </p>
              <div className="flex gap-3">
                <Link to="/privacy-policy" className="text-primary underline">
                  Privacy Policy
                </Link>
                <Link to="/terms-of-service" className="text-primary underline">
                  Terms of Service
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DeleteAccount;
