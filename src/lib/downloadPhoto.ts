import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";

/**
 * Download / save a photo.
 *
 * Web: fetches the image as a blob and triggers a normal browser download.
 * Native (iOS/Android via Capacitor): writes the file to the app cache and
 * opens the native share sheet, where the user can pick "Save Image" /
 * "Save to Files" to store it on the device.
 */
export async function downloadPhoto(url: string, filename = "photo.jpg"): Promise<void> {
  if (!url) {
    toast.error("Photo is not available");
    return;
  }

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();

    if (Capacitor.isNativePlatform()) {
      const [{ Filesystem, Directory }, { Share }] = await Promise.all([
        import("@capacitor/filesystem"),
        import("@capacitor/share"),
      ]);

      const base64 = await blobToBase64(blob);
      const written = await Filesystem.writeFile({
        path: safeName,
        data: base64,
        directory: Directory.Cache,
      });

      await Share.share({
        title: safeName,
        url: written.uri,
        dialogTitle: "Save photo",
      });
      return;
    }

    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    toast.success("Photo downloaded");
  } catch (err: any) {
    // User dismissing the native share sheet throws — don't show an error for that.
    const msg = String(err?.message || "");
    if (/cancel/i.test(msg) || /abort/i.test(msg)) return;
    console.error("[downloadPhoto] failed", err);
    toast.error("Could not download photo");
  }
}

/** Build a readable filename like `front_2026-07-28.jpg`. */
export function photoFilename(pose: string | null | undefined, date: string | null | undefined, ext = "jpg") {
  const p = (pose || "photo").toLowerCase().replace(/\s+/g, "-");
  const d = date ? String(date).slice(0, 10) : new Date().toLocaleDateString("en-CA");
  return `${p}_${d}.${ext}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("FileReader failed"));
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}
