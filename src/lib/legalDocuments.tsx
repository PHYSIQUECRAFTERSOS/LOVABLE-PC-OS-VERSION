import { jsPDF } from "jspdf";
import { format } from "date-fns";

/**
 * Canonical body of the Onboarding Waiver & Coaching Agreement.
 * Mirrors the text used in OnboardingWaiver.tsx but without the
 * dynamic Effective Date so historical records render consistently.
 */
export const WAIVER_BODY = `PHYSIQUE CRAFTERS — LIABILITY WAIVER & COACHING AGREEMENT

1. ASSUMPTION OF RISK
I understand that participation in any fitness or nutrition coaching program involves inherent risks, including but not limited to physical injury, muscle soreness, fatigue, and other potential health complications. I voluntarily assume all risks associated with my participation.

2. MEDICAL CLEARANCE
I confirm that I am in good physical health and have consulted with a physician regarding my ability to participate in a fitness program. I have disclosed any and all medical conditions, injuries, or limitations to my coach through the onboarding questionnaire.

3. LIABILITY RELEASE
I hereby release Physique Crafters, its coaches, employees, and affiliates from any and all liability, claims, demands, or causes of action arising from my participation in the coaching program, including any injuries sustained during exercise.

4. COACHING GUIDELINES
I agree to:
• Follow my prescribed training and nutrition plan to the best of my ability
• Communicate honestly and promptly with my coach
• Report any pain, injury, or adverse reaction immediately
• Not share my program or meal plans with others
• Complete weekly check-ins as scheduled

5. PROGRAM USE
I understand that:
• My program is personalized and should not be shared or distributed
• Results vary based on individual effort, adherence, and genetics
• Physique Crafters does not guarantee specific results
• My coach may modify my program based on my progress and feedback

6. PAYMENT & CANCELLATION
I agree to the payment terms outlined at enrollment. Cancellation policies as agreed upon at the time of purchase apply.

7. DATA & PRIVACY
My personal information, progress photos, and health data will be kept confidential and used solely for coaching purposes. Data handling follows our Privacy Policy.

8. ACKNOWLEDGMENT
By signing this agreement, I confirm that I have read, understood, and agree to all terms outlined in this waiver. I am signing this agreement voluntarily and of my own free will.`;

/**
 * Render a plain-text legal document body into styled JSX paragraphs.
 * Extracted from DocumentViewer.tsx so the same styling is shared by
 * the signing flow and the preview / download modal.
 */
export function renderDocumentBody(body: string) {
  const lines = body.split("\n");
  return lines.map((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={i} className="h-3" />;

    // Top-of-document title (ALL CAPS)
    if (i === 0 || (trimmed === trimmed.toUpperCase() && trimmed.length > 10 && !trimmed.startsWith("•"))) {
      return (
        <h2 key={i} className="text-primary font-display text-lg font-bold mt-6 mb-2 tracking-wide">
          {trimmed}
        </h2>
      );
    }

    if (/^\d+\.\s/.test(trimmed)) {
      return (
        <h3 key={i} className="text-primary/90 font-display text-base font-semibold mt-5 mb-2">
          {trimmed}
        </h3>
      );
    }

    if (trimmed.startsWith("•")) {
      return (
        <p key={i} className="text-foreground/80 text-sm pl-4 py-0.5">
          {trimmed}
        </p>
      );
    }

    if (trimmed.startsWith("Effective Date:") || trimmed.startsWith("Last Updated:")) {
      return (
        <p key={i} className="text-muted-foreground text-xs italic">
          {trimmed}
        </p>
      );
    }

    if (trimmed.endsWith(":") && trimmed.length < 60) {
      return (
        <p key={i} className="text-foreground/90 text-sm font-semibold mt-3 mb-1">
          {trimmed}
        </p>
      );
    }

    return (
      <p key={i} className="text-foreground/75 text-sm leading-relaxed">
        {trimmed}
      </p>
    );
  });
}

export interface SignatureFooterData {
  signed_name: string | null;
  signed_at: string | null;
  tier?: string | null;
  version?: string | null;
  ip_address?: string | null;
  client_full_name?: string | null;
}

/** Compact signature footer shown beneath the rendered document body. */
export function SignatureFooter({ data }: { data: SignatureFooterData }) {
  if (!data.signed_name && !data.signed_at) return null;
  const dateStr = data.signed_at
    ? format(new Date(data.signed_at), "MMMM d, yyyy 'at' h:mm a")
    : "—";
  return (
    <div className="mt-8 rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">
        Signature on file
      </p>
      {data.client_full_name && (
        <p className="text-sm text-foreground">
          <span className="text-muted-foreground">Client:</span> {data.client_full_name}
        </p>
      )}
      {data.signed_name && (
        <p className="text-sm text-foreground">
          <span className="text-muted-foreground">Signed name:</span> {data.signed_name}
        </p>
      )}
      <p className="text-sm text-foreground">
        <span className="text-muted-foreground">Date signed:</span> {dateStr}
      </p>
      {data.tier && (
        <p className="text-sm text-foreground">
          <span className="text-muted-foreground">Tier at signing:</span> {data.tier}
        </p>
      )}
      {data.version && (
        <p className="text-sm text-foreground">
          <span className="text-muted-foreground">Version:</span> v{data.version}
        </p>
      )}
      {data.ip_address && (
        <p className="text-sm text-foreground">
          <span className="text-muted-foreground">IP address:</span> {data.ip_address}
        </p>
      )}
    </div>
  );
}

/**
 * Generate a downloadable PDF from a title, body and signature footer.
 * Used when no stored PDF exists on the signature record (legacy waivers,
 * older signatures created before PDF generation was added, etc).
 */
export function generateDocumentPdf(options: {
  title: string;
  body: string;
  footer: SignatureFooterData;
  filename: string;
}) {
  const { title, body, footer, filename } = options;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 54; // 0.75"
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(20, 20, 20);
  const titleLines = doc.splitTextToSize(title, contentWidth);
  titleLines.forEach((line: string) => {
    ensureSpace(22);
    doc.text(line, margin, y);
    y += 20;
  });
  y += 8;

  // Body
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(40, 40, 40);

  body.split("\n").forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      y += 8;
      return;
    }

    const isAllCapsHeading =
      line === line.toUpperCase() && line.length > 10 && !line.startsWith("•");
    const isNumberedHeading = /^\d+\.\s/.test(line);

    if (isAllCapsHeading) {
      y += 6;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
    } else if (isNumberedHeading) {
      y += 4;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11.5);
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
    }

    const indent = line.startsWith("•") ? 14 : 0;
    const wrapped = doc.splitTextToSize(line, contentWidth - indent);
    wrapped.forEach((w: string) => {
      ensureSpace(16);
      doc.text(w, margin + indent, y);
      y += 15;
    });

    if (isAllCapsHeading || isNumberedHeading) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      y += 2;
    }
  });

  // Signature footer
  y += 14;
  ensureSpace(120);
  doc.setDrawColor(212, 160, 23);
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(140, 100, 10);
  doc.text("SIGNATURE ON FILE", margin, y);
  y += 16;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(40, 40, 40);

  const footerRow = (label: string, value: string | null | undefined) => {
    if (!value) return;
    ensureSpace(14);
    doc.text(`${label}: ${value}`, margin, y);
    y += 14;
  };

  footerRow("Client", footer.client_full_name || undefined);
  footerRow("Signed name", footer.signed_name || undefined);
  footerRow(
    "Date signed",
    footer.signed_at ? format(new Date(footer.signed_at), "MMMM d, yyyy 'at' h:mm a") : undefined
  );
  footerRow("Tier at signing", footer.tier || undefined);
  footerRow("Version", footer.version ? `v${footer.version}` : undefined);
  footerRow("IP address", footer.ip_address || undefined);

  doc.save(filename);
}

export function buildPdfFilename(title: string, clientName: string | null, signedAt: string | null) {
  const safe = (s: string) =>
    s
      .replace(/[^a-z0-9]+/gi, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
  const date = signedAt ? format(new Date(signedAt), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
  const parts = [safe(title || "Document"), clientName ? safe(clientName) : null, date].filter(Boolean);
  return `${parts.join("_")}.pdf`;
}
