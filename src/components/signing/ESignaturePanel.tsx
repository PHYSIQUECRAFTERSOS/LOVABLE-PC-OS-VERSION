import { useState } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  tierName: string;
  documentCount: number;
  onSign: (signedName: string) => void;
  signing: boolean;
}

const ESignaturePanel = ({ tierName, documentCount, onSign, signing }: Props) => {
  const [signedName, setSignedName] = useState("");
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const handleSubmit = () => {
    if (signedName.trim().length < 2) return;
    onSign(signedName.trim());
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-6">
      <div className="text-center space-y-2">
        <ShieldCheck className="h-10 w-10 text-primary mx-auto" />
        <h2 className="font-display text-xl font-bold text-foreground">
          Sign to Complete Your Agreement
        </h2>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          By typing your full legal name below, you confirm you have read, understand, and agree to
          all {documentCount} document{documentCount > 1 ? "s" : ""} presented. This constitutes your
          legally binding electronic signature.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="signed_name">Full Legal Name</Label>
          <Input
            id="signed_name"
            value={signedName}
            onChange={(e) => setSignedName(e.target.value)}
            placeholder="Type your full name exactly as it appears on your ID"
            className="text-base"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Date</Label>
            <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-foreground">
              {today}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Tier</Label>
            <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-foreground truncate">
              {tierName}
            </div>
          </div>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={signing || signedName.trim().length < 2}
          className="w-full"
        >
          {signing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          {signing ? "Saving…" : "Complete Sign-Up"}
        </Button>
      </div>
    </div>
  );
};

export default ESignaturePanel;
