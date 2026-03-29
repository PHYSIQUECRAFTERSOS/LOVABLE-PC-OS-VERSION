import Foundation
import UIKit
import Capacitor

/// Bridges iOS APNs registration callbacks back into Capacitor's
/// PushNotifications plugin so JS listeners receive registration events.
///
/// Include this file in the iOS App target.
extension AppDelegate {
    public func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)

        let tokenPreview = deviceToken
            .map { String(format: "%02.2hhx", $0) }
            .joined()
            .prefix(16)

        CAPLog.print("[PushBridge] APNs registration succeeded: \(tokenPreview)...")
    }

    public func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
        CAPLog.print("[PushBridge] APNs registration failed: \(error.localizedDescription)")
    }
}
