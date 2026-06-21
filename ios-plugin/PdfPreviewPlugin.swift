import Foundation
import UIKit
import QuickLook
import Capacitor

/// Presents a generated PDF in iOS Quick Look (QLPreviewController) so the
/// user can scroll every page before deciding to share/save. Quick Look's
/// built-in toolbar already exposes Share → Save to Files / AirDrop / etc,
/// so the existing "save" UX from the web iframe is preserved.
///
/// Why a custom plugin: the web fallback renders the blob inside an
/// <iframe>, but iOS WKWebView only paints the first page of a PDF blob.
/// QLPreviewController is the only reliable way to scroll all pages on
/// native iOS.
@objc(PdfPreviewPlugin)
public class PdfPreviewPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PdfPreviewPlugin"
    public let jsName = "PdfPreview"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "preview", returnType: CAPPluginReturnPromise),
    ]

    private var dataSource: PdfQuickLookDataSource?

    @objc func preview(_ call: CAPPluginCall) {
        guard let base64 = call.getString("base64"), !base64.isEmpty else {
            call.reject("Missing base64 PDF payload")
            return
        }
        let rawName = call.getString("filename") ?? "document.pdf"
        let safeName = sanitizeFilename(rawName)

        guard let data = Data(base64Encoded: base64, options: [.ignoreUnknownCharacters]) else {
            call.reject("Could not decode PDF base64")
            return
        }

        let tmpDir = FileManager.default.temporaryDirectory
        let tmpURL = tmpDir.appendingPathComponent(safeName)

        do {
            // Replace any stale file from a previous export with the same name.
            if FileManager.default.fileExists(atPath: tmpURL.path) {
                try FileManager.default.removeItem(at: tmpURL)
            }
            try data.write(to: tmpURL, options: .atomic)
        } catch {
            call.reject("Failed to write PDF to temp dir: \(error.localizedDescription)")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            guard let presenter = self.topPresentedViewController() else {
                call.reject("No view controller available to present preview")
                return
            }

            let ds = PdfQuickLookDataSource(url: tmpURL)
            self.dataSource = ds // retain until dismissed

            let preview = QLPreviewController()
            preview.dataSource = ds
            preview.modalPresentationStyle = .fullScreen

            presenter.present(preview, animated: true) {
                call.resolve(["presented": true])
            }
        }
    }

    private func sanitizeFilename(_ name: String) -> String {
        let invalid = CharacterSet(charactersIn: "/\\:?%*|\"<>")
        var cleaned = name.components(separatedBy: invalid).joined(separator: "_")
        if !cleaned.lowercased().hasSuffix(".pdf") {
            cleaned += ".pdf"
        }
        return cleaned
    }

    private func topPresentedViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let keyWindow = scenes
            .flatMap { $0.windows }
            .first(where: { $0.isKeyWindow })
            ?? scenes.flatMap { $0.windows }.first
        var top = keyWindow?.rootViewController
        while let presented = top?.presentedViewController {
            top = presented
        }
        return top
    }
}

/// Tiny data source that exposes a single file URL to QLPreviewController.
private final class PdfQuickLookDataSource: NSObject, QLPreviewControllerDataSource {
    let url: URL
    init(url: URL) { self.url = url }

    func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }

    func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
        return url as NSURL
    }
}
