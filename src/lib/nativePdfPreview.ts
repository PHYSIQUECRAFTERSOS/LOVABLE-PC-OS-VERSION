import { registerPlugin, Capacitor } from "@capacitor/core";

interface PdfPreviewPlugin {
  preview(options: { base64: string; filename: string }): Promise<{ presented: boolean }>;
}

const PdfPreview = registerPlugin<PdfPreviewPlugin>("PdfPreview");

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("FileReader failed"));
    reader.onload = () => {
      const result = reader.result as string;
      // result is "data:application/pdf;base64,XXXX"
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.readAsDataURL(blob);
  });

/**
 * On native iOS, present the PDF in QLPreviewController so all pages are
 * scrollable. From Quick Look's built-in toolbar the user can Share → Save
 * to Files, AirDrop, Mail, etc — preserving the existing save UX.
 *
 * Returns `true` when the native preview was presented. Returns `false` on
 * web / Android / older iOS so callers can fall back to the in-app dialog.
 */
export const isNativePdfPreviewAvailable = (): boolean => {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
  } catch {
    return false;
  }
};

export const previewPdfNative = async (
  blob: Blob,
  filename: string
): Promise<boolean> => {
  if (!isNativePdfPreviewAvailable()) return false;
  try {
    const base64 = await blobToBase64(blob);
    const res = await PdfPreview.preview({ base64, filename });
    return !!res?.presented;
  } catch (err) {
    console.warn("[previewPdfNative] failed; falling back", err);
    return false;
  }
};
