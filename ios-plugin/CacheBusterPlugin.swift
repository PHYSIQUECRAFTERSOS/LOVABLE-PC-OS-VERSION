import Foundation
import Capacitor
import WebKit

@objc(CacheBusterPlugin)
public class CacheBusterPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CacheBusterPlugin"
    public let jsName = "CacheBuster"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "clearCache", returnType: CAPPluginReturnPromise)
    ]

    @objc func clearCache(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            // Clear URLCache (HTTP-level disk + memory cache)
            URLCache.shared.removeAllCachedResponses()

            // Clear WKWebView's data store (the real culprit)
            let dataStore = WKWebsiteDataStore.default()
            let dataTypes: Set<String> = [
                WKWebsiteDataTypeDiskCache,
                WKWebsiteDataTypeMemoryCache,
                WKWebsiteDataTypeOfflineWebApplicationCache,
                WKWebsiteDataTypeFetchCache,
                WKWebsiteDataTypeServiceWorkerRegistrations
            ]

            dataStore.removeData(
                ofTypes: dataTypes,
                modifiedSince: Date(timeIntervalSince1970: 0)
            ) {
                print("[CacheBuster] WKWebView cache cleared successfully")
                call.resolve(["cleared": true])
            }
        }
    }
}
