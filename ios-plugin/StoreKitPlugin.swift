// StoreKitPlugin.swift
// Add to Xcode: App/App/Plugins/StoreKitPlugin.swift
//
// Thin Capacitor bridge — delegates ALL logic to StoreKitManager.

import Foundation
import Capacitor
import StoreKit
import SwiftUI

@objc(StoreKitPlugin)
public class StoreKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StoreKitPlugin"
    public let jsName = "StoreKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkSubscription", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showPaywall", returnType: CAPPluginReturnPromise),
    ]

    // MARK: - Purchase

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("Missing productId", "INVALID_ARGS")
            return
        }

        if #available(iOS 15.0, *) {
            Task { @MainActor in
                do {
                    let transaction = try await StoreKitManager.shared.purchase(productId)

                    self.notifyListeners("subscriptionUpdate", data: [
                        "hasSubscription": true,
                        "productIDs": [transaction.productID]
                    ])

                    call.resolve([
                        "success": true,
                        "productId": transaction.productID
                    ])
                } catch is CancellationError {
                    call.reject("User cancelled", "USER_CANCELLED")
                } catch {
                    call.reject("Purchase failed: \(error.localizedDescription)", "PURCHASE_FAILED")
                }
            }
        } else {
            call.reject("iOS 15 required", "UNSUPPORTED_OS")
        }
    }

    // MARK: - Check Subscription

    @objc func checkSubscription(_ call: CAPPluginCall) {
        if #available(iOS 15.0, *) {
            Task { @MainActor in
                await StoreKitManager.shared.refreshEntitlements()
                let ids = Array(StoreKitManager.shared.activeSubscriptionIDs)
                call.resolve([
                    "hasSubscription": !ids.isEmpty,
                    "productIDs": ids
                ])
            }
        } else {
            call.resolve(["hasSubscription": false, "productIDs": []])
        }
    }

    // MARK: - Restore Purchases

    @objc func restorePurchases(_ call: CAPPluginCall) {
        if #available(iOS 15.0, *) {
            Task { @MainActor in
                do {
                    try await StoreKitManager.shared.restorePurchases()
                    let ids = Array(StoreKitManager.shared.activeSubscriptionIDs)

                    if !ids.isEmpty {
                        self.notifyListeners("subscriptionUpdate", data: [
                            "hasSubscription": true,
                            "productIDs": ids
                        ])
                    }

                    call.resolve([
                        "hasSubscription": !ids.isEmpty,
                        "productIDs": ids
                    ])
                } catch {
                    call.reject("Restore failed: \(error.localizedDescription)", "RESTORE_FAILED")
                }
            }
        } else {
            call.resolve(["hasSubscription": false, "productIDs": []])
        }
    }

    // MARK: - Get Products

    @objc func getProducts(_ call: CAPPluginCall) {
        if #available(iOS 15.0, *) {
            Task { @MainActor in
                if StoreKitManager.shared.products.isEmpty {
                    await StoreKitManager.shared.loadProducts()
                }
                call.resolve(["products": StoreKitManager.shared.productDicts()])
            }
        } else {
            call.resolve(["products": []])
        }
    }

    // MARK: - Show Paywall

    @objc func showPaywall(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let vc = self.bridge?.viewController else {
                call.reject("No view controller", "NO_VC")
                return
            }
            if #available(iOS 15.0, *) {
                let paywallView = PaywallView()
                let hostingController = UIHostingController(rootView: paywallView)
                hostingController.modalPresentationStyle = .pageSheet
                vc.present(hostingController, animated: true)
                call.resolve()
            } else {
                call.reject("iOS 15 required", "UNSUPPORTED_OS")
            }
        }
    }
}
