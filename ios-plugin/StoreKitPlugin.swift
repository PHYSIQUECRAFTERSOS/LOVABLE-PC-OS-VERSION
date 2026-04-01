// StoreKitPlugin.swift
// Add this file to your Xcode project under App/App/Plugins/
//
// REQUIREMENTS:
// - iOS 15+ (StoreKit 2)
// - Capacitor 5+
// - Products configured in App Store Connect with matching IDs

import Foundation
import Capacitor
import StoreKit
import SwiftUI

// Local verification error — named uniquely to avoid duplicate-symbol
// conflicts with StoreKitManager.swift which defines its own StoreError.
private enum StoreKitPluginError: Error {
    case failedVerification
}

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
            Task {
                do {
                    let products = try await Product.products(for: [productId])
                    guard let product = products.first else {
                        call.reject("Product not found: \(productId)", "PRODUCT_NOT_FOUND")
                        return
                    }

                    let result = try await product.purchase()

                    switch result {
                    case .success(let verification):
                        let transaction = try self.checkVerified(verification)
                        await transaction.finish()

                        // Notify JS layer of the update
                        self.notifyListeners("subscriptionUpdate", data: [
                            "hasSubscription": true,
                            "productIDs": [productId]
                        ])

                        call.resolve([
                            "success": true,
                            "productId": productId
                        ])

                    case .userCancelled:
                        call.reject("User cancelled", "USER_CANCELLED")

                    case .pending:
                        call.reject("Purchase pending approval", "PURCHASE_PENDING")

                    @unknown default:
                        call.reject("Unknown purchase result", "PURCHASE_FAILED")
                    }
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
            Task {
                var activeProductIDs: [String] = []

                for await result in Transaction.currentEntitlements {
                    if let transaction = try? self.checkVerified(result) {
                        if transaction.revocationDate == nil {
                            activeProductIDs.append(transaction.productID)
                        }
                    }
                }

                let hasSubscription = !activeProductIDs.isEmpty
                call.resolve([
                    "hasSubscription": hasSubscription,
                    "productIDs": activeProductIDs
                ])
            }
        } else {
            call.resolve(["hasSubscription": false, "productIDs": []])
        }
    }

    // MARK: - Restore Purchases

    @objc func restorePurchases(_ call: CAPPluginCall) {
        if #available(iOS 15.0, *) {
            Task {
                do {
                    try await AppStore.sync()

                    var activeProductIDs: [String] = []
                    for await result in Transaction.currentEntitlements {
                        if let transaction = try? self.checkVerified(result) {
                            if transaction.revocationDate == nil {
                                activeProductIDs.append(transaction.productID)
                            }
                        }
                    }

                    let hasSubscription = !activeProductIDs.isEmpty

                    if hasSubscription {
                        self.notifyListeners("subscriptionUpdate", data: [
                            "hasSubscription": true,
                            "productIDs": activeProductIDs
                        ])
                    }

                    call.resolve([
                        "hasSubscription": hasSubscription,
                        "productIDs": activeProductIDs
                    ])
                } catch {
                    call.reject("Restore failed: \(error.localizedDescription)", "RESTORE_FAILED")
                }
            }
        } else {
            call.resolve(["hasSubscription": false, "productIDs": []])
        }
    }

    // MARK: - Get Products (live pricing)

    @objc func getProducts(_ call: CAPPluginCall) {
        guard let productIds = call.getArray("productIds", String.self) else {
            call.reject("Missing productIds", "INVALID_ARGS")
            return
        }

        if #available(iOS 15.0, *) {
            Task {
                do {
                    let products = try await Product.products(for: Set(productIds))
                    let mapped = products.map { product -> [String: Any] in
                        return [
                            "id": product.id,
                            "price": product.displayPrice,
                            "displayName": product.displayName,
                            "description": product.description
                        ]
                    }
                    call.resolve(["products": mapped])
                } catch {
                    call.reject("Failed to fetch products: \(error.localizedDescription)", "PRODUCTS_FAILED")
                }
            }
        } else {
            call.resolve(["products": []])
        }
    }

    // MARK: - Show Paywall (presents SwiftUI PaywallView)

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

    // MARK: - Helpers

    @available(iOS 15.0, *)
    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified(_, _):
            throw StoreError.failedVerification
        case .verified(let safe):
            return safe
        }
    }
}
