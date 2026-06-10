/**
 * Shared Physique Crafters branded PDF helpers built on jsPDF + jspdf-autotable.
 *
 * Usage:
 *   const doc = createBrandedDoc();
 *   drawCoverPage(doc, { title: "Meal Plan", clientName, coachName });
 *   beginSection(doc, "Training Day");
 *   // ... addContent / autoTable ...
 *   await savePdf(doc, "Kevin-MealPlan-2026-06-07.pdf");
 */
import jsPDF from "jspdf";
import autoTable, { type UserOptions } from "jspdf-autotable";

// Physique Crafters palette
export const PC_BLACK: [number, number, number] = [10, 10, 10];      // #0a0a0a
export const PC_GOLD: [number, number, number]  = [212, 160, 23];    // #D4A017
export const PC_TEXT: [number, number, number]  = [25, 25, 25];
export const PC_MUTED: [number, number, number] = [120, 120, 120];
export const PC_LINE: [number, number, number]  = [220, 220, 220];

export const PAGE = {
  width: 612,   // 8.5" * 72 (jsPDF default unit "pt")
  height: 792,  // 11" * 72
  marginX: 54,  // 0.75"
  marginTop: 78,
  marginBottom: 54,
};

export function createBrandedDoc(): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  return doc;
}

/** Draw the gold-on-black header band on the current page. */
function drawHeaderBand(doc: jsPDF) {
  doc.setFillColor(...PC_BLACK);
  doc.rect(0, 0, PAGE.width, 36, "F");
  doc.setFontSize(10);
  doc.setTextColor(...PC_GOLD);
  doc.setFont("helvetica", "bold");
  doc.text("PHYSIQUE CRAFTERS", PAGE.marginX, 23);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 180, 180);
  doc.setFontSize(8);
  doc.text("physiquecrafters.com", PAGE.width - PAGE.marginX, 23, { align: "right" });
}

/** Footer: page number + client name + date */
function drawFooter(doc: jsPDF, opts: { clientName: string; date: string; pageNum: number; totalPages: number }) {
  const y = PAGE.height - 30;
  doc.setDrawColor(...PC_LINE);
  doc.setLineWidth(0.5);
  doc.line(PAGE.marginX, y - 14, PAGE.width - PAGE.marginX, y - 14);
  doc.setFontSize(8);
  doc.setTextColor(...PC_MUTED);
  doc.setFont("helvetica", "normal");
  doc.text(`${opts.clientName} • Generated ${opts.date}`, PAGE.marginX, y);
  doc.text(`Page ${opts.pageNum} of ${opts.totalPages}`, PAGE.width - PAGE.marginX, y, { align: "right" });
}

/** Cover page (page 1). */
export function drawCoverPage(
  doc: jsPDF,
  opts: { title: string; clientName: string; coachName?: string | null; subtitle?: string },
) {
  // Full black cover
  doc.setFillColor(...PC_BLACK);
  doc.rect(0, 0, PAGE.width, PAGE.height, "F");

  // Gold wordmark top
  doc.setTextColor(...PC_GOLD);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("PHYSIQUE CRAFTERS", PAGE.width / 2, 140, { align: "center" });

  // Gold rule
  doc.setDrawColor(...PC_GOLD);
  doc.setLineWidth(1.5);
  doc.line(PAGE.width / 2 - 50, 156, PAGE.width / 2 + 50, 156);

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(34);
  doc.setFont("helvetica", "bold");
  doc.text(opts.title, PAGE.width / 2, 230, { align: "center" });

  if (opts.subtitle) {
    doc.setFontSize(13);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(200, 200, 200);
    doc.text(opts.subtitle, PAGE.width / 2, 260, { align: "center" });
  }

  // Meta block
  doc.setFontSize(11);
  doc.setTextColor(220, 220, 220);
  doc.setFont("helvetica", "normal");
  const metaY = 380;
  doc.text("Prepared for", PAGE.width / 2, metaY, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text(opts.clientName, PAGE.width / 2, metaY + 24, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(180, 180, 180);
  doc.text(
    new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }),
    PAGE.width / 2,
    metaY + 50,
    { align: "center" },
  );
  if (opts.coachName) {
    doc.text(`Coach: ${opts.coachName}`, PAGE.width / 2, metaY + 66, { align: "center" });
  }

  // Footer brand
  doc.setTextColor(...PC_GOLD);
  doc.setFontSize(9);
  doc.text("physiquecrafters.com", PAGE.width / 2, PAGE.height - 60, { align: "center" });
}

/** Add a new page with the standard branded header band. Returns the y cursor below the header. */
export function newContentPage(doc: jsPDF): number {
  doc.addPage();
  drawHeaderBand(doc);
  return PAGE.marginTop;
}

/** Draw a section title with a gold underline rule. Returns updated y. */
export function drawSectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...PC_BLACK);
  doc.text(title, PAGE.marginX, y);
  doc.setDrawColor(...PC_GOLD);
  doc.setLineWidth(2);
  doc.line(PAGE.marginX, y + 6, PAGE.marginX + 60, y + 6);
  return y + 28;
}

/** Draw a body paragraph (auto-wrapped). Returns updated y. */
export function drawParagraph(
  doc: jsPDF,
  text: string,
  y: number,
  opts?: { bold?: boolean; size?: number; color?: [number, number, number] },
): number {
  if (!text) return y;
  doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
  doc.setFontSize(opts?.size ?? 10);
  doc.setTextColor(...(opts?.color ?? PC_TEXT));
  const maxWidth = PAGE.width - PAGE.marginX * 2;
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, PAGE.marginX, y);
  return y + lines.length * (opts?.size ?? 10) * 1.25 + 4;
}

/** Draw a labeled stats row like:  Calories 2400   •   Protein 220g  ... Returns updated y. */
export function drawStatsRow(
  doc: jsPDF,
  pairs: { label: string; value: string }[],
  y: number,
): number {
  const colW = (PAGE.width - PAGE.marginX * 2) / pairs.length;
  pairs.forEach((p, i) => {
    const x = PAGE.marginX + colW * i;
    doc.setFontSize(8);
    doc.setTextColor(...PC_MUTED);
    doc.setFont("helvetica", "normal");
    doc.text(p.label.toUpperCase(), x, y);
    doc.setFontSize(14);
    doc.setTextColor(...PC_BLACK);
    doc.setFont("helvetica", "bold");
    doc.text(p.value, x, y + 16);
  });
  return y + 32;
}

/** Wrapper around jspdf-autotable with PC styling baked in. */
export function pcTable(doc: jsPDF, y: number, options: UserOptions): number {
  autoTable(doc, {
    startY: y,
    margin: { left: PAGE.marginX, right: PAGE.marginX },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5, textColor: PC_TEXT, lineColor: PC_LINE, lineWidth: 0.3 },
    headStyles: { fillColor: PC_BLACK, textColor: PC_GOLD, fontStyle: "bold", fontSize: 9 },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    ...options,
  });
  // @ts-ignore — autotable mutates doc with lastAutoTable
  return (doc as any).lastAutoTable.finalY + 14;
}

/** Apply header band + footers to every page after content is built. */
export function finalizePages(
  doc: jsPDF,
  opts: { clientName: string; coverFirstPage?: boolean },
) {
  const total = doc.getNumberOfPages();
  const dateStr = new Date().toLocaleDateString();
  const startPage = opts.coverFirstPage ? 2 : 1;
  for (let i = startPage; i <= total; i++) {
    doc.setPage(i);
    drawFooter(doc, {
      clientName: opts.clientName,
      date: dateStr,
      pageNum: opts.coverFirstPage ? i - 1 : i,
      totalPages: opts.coverFirstPage ? total - 1 : total,
    });
  }
}

/**
 * Trigger save. On native (Capacitor) writes directly to Files/Downloads.
 * On mobile web (PWA) opens the PDF blob in a new tab so the user can save.
 * On desktop browsers, uses jsPDF's anchor download.
 */
export async function savePdf(
  doc: jsPDF,
  filename: string,
  opts: { preWin?: Window | null } = {}
) {
  const capCore: any = (window as any).Capacitor;
  const isNative = !!capCore?.isNativePlatform?.();
  const platform: string = capCore?.getPlatform?.() || "web";
  const preWin = opts.preWin || null;

  // ---------- Native (iOS / Android) ----------
  if (isNative) {
    try { preWin?.close(); } catch { /* noop */ }
    try {
      const dynImport: (s: string) => Promise<any> = (s) =>
        new Function("s", "return import(s)")(s);
      const [fsMod, shareMod]: any[] = await Promise.all([
        dynImport("@capacitor/filesystem"),
        dynImport("@capacitor/share").catch(() => null),
      ]);
      const { Filesystem, Directory } = fsMod;
      const Share = shareMod?.Share;

      const dataUri = doc.output("datauristring");
      const base64 = dataUri.split(",")[1];

      let writePath = filename;
      let directory = Directory.Documents;
      if (platform === "android") {
        writePath = `Download/${filename}`;
        directory = Directory.ExternalStorage;
      }

      let written: any;
      try {
        written = await Filesystem.writeFile({
          path: writePath,
          data: base64,
          directory,
          recursive: true,
        });
      } catch (e) {
        if (platform === "android") {
          written = await Filesystem.writeFile({
            path: filename,
            data: base64,
            directory: Directory.Documents,
            recursive: true,
          });
        } else {
          throw e;
        }
      }

      try {
        const { toast } = await import("sonner");
        const location =
          platform === "android" ? "Downloads folder" : "Files app";
        toast.success(`Saved to ${location}`, {
          description: filename,
          action: Share
            ? {
                label: "Open",
                onClick: () => {
                  Share.share({
                    title: filename,
                    url: written.uri,
                    dialogTitle: "Open PDF",
                  }).catch(() => {});
                },
              }
            : undefined,
          duration: 6000,
        });
      } catch {
        /* toast optional */
      }
      return;
    } catch (err) {
      console.error("[brandedPdf] native save failed:", err);
      // fall through to web fallback
    }
  }

  // ---------- Mobile web (PWA / iOS Safari) ----------
  const ua = navigator.userAgent || "";
  const isMobileWeb = /iPhone|iPad|iPod|Android/i.test(ua);
  if (isMobileWeb) {
    try {
      // iOS Safari (esp. standalone PWA) opens data URIs in-tab more reliably
      // than blob: URLs. Use data URI when we have a pre-opened tab (user gesture).
      const dataUri = doc.output("dataurlstring");
      if (preWin && !preWin.closed) {
        try {
          preWin.location.href = dataUri;
          return;
        } catch (e) {
          console.warn("[brandedPdf] preWin navigate failed:", e);
        }
      }
      // No pre-opened window (or it was closed): try anchor download fallback.
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return;
    } catch (err) {
      console.warn("[brandedPdf] mobile web fallback failed:", err);
      try { preWin?.close(); } catch { /* noop */ }
    }
  }

  // ---------- Desktop browser ----------
  try { preWin?.close(); } catch { /* noop */ }
  doc.save(filename);
}



/** Build a safe filename slug from a name. */
export function nameSlug(name: string | null | undefined, fallback = "Client"): string {
  const base = (name || fallback).trim().split(/\s+/)[0] || fallback;
  return base.replace(/[^A-Za-z0-9-]/g, "");
}

export function todayStamp(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
