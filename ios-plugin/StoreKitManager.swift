// StoreKitManager.swift
// Add to Xcode: App/App/Plugins/StoreKitManager.swift
//
// Single source of truth for all StoreKit 2 logic.
// Both StoreKitPlugin (Capacitor) and PaywallView (SwiftUI) delegate here.

import Foundation
import StoreKit

// ── Error type (defined ONCE, here only) ─────────────────────────
@available(iOS 15.0, *)
enum StoreError: Error, LocalizedError {
    case failedVerification
    case productNotFound(String)

    var errorDescription: String? {
        switch self {
        case .failedVerification:
            return "Transaction verification failed."
        case .productNotFound(let id):
            return "Product not found: \(id)"
        }
    }
}

// ── Manager ──────────────────────────────────────────────────────
@available(iOS 15.0, *)
@MainActor
final class StoreKitManager: ObservableObject {

    static let shared = StoreKitManager()

    static let productIDs: Set<String> = [
        "com.physiquecrafters.app.monthly",
        "com.physiquecrafters.app.biweekly"
    ]

    @Published private(set) var products: [Product] = []
    @Published private(set) var activeSubscriptionIDs: Set<String> = []

    var hasActiveSubscription: Bool { !activeSubscriptionIDs.isEmpty }

    private var transactionListener: Task<Void, Error>?

    // ── Init ─────────────────────────────────────────────────────
    private init() {
        transactionListener = listenForTransactions()
        Task { [weak self] in
            await self?.loadProducts()
            await self?.refreshEntitlements()
        }
    }

    deinit { transactionListener?.cancel() }

    // ── Load products from App Store ─────────────────────────────
    func loadProducts() async {
        do {
            let storeProducts = try await Product.products(for: Self.productIDs)
            products = storeProducts.sorted { $0.price < $1.price }
        } catch {
            print("[StoreKitManager] Failed to load products: \(error)")
        }
    }

    // ── Purchase (by product ID string) ──────────────────────────
    @discardableResult
    func purchase(_ productId: String) async throws -> Transaction {
        guard let product = products.first(where: { $0.id == productId }) else {
            // Products may not be loaded yet — try once
            await loadProducts()
            guard let product = products.first(where: { $0.id == productId }) else {
                throw StoreError.productNotFound(productId)
            }
            return try await executePurchase(product)
        }
        return try await executePurchase(product)
    }

    private func executePurchase(_ product: Product) async throws -> Transaction {
        let result = try await product.purchase()

        switch result {
        case .success(let verification):
            let transaction = try checkVerified(verification)
            await transaction.finish()
            await refreshEntitlements()
            return transaction

        case .userCancelled:
            throw CancellationError()

        case .pending:
            throw StoreError.failedVerification // treat pending as non-success

        @unknown default:
            throw StoreError.failedVerification
        }
    }

    // ── Restore ──────────────────────────────────────────────────
    func restorePurchases() async throws {
        try await AppStore.sync()
        await refreshEntitlements()
    }

    // ── Refresh entitlements ─────────────────────────────────────
    func refreshEntitlements() async {
        var active: Set<String> = []
        for await result in Transaction.currentEntitlements {
            if let tx = try? checkVerified(result),
               tx.revocationDate == nil {
                active.insert(tx.productID)
            }
        }
        activeSubscriptionIDs = active
    }

    // ── Get product info as dictionaries (for Capacitor bridge) ──
    func productDicts() -> [[String: Any]] {
        products.map { p in
            [
                "id": p.id,
                "price": p.displayPrice,
                "displayName": p.displayName,
                "description": p.description
            ]
        }
    }

    // ── Transaction listener (background updates) ────────────────
    private func listenForTransactions() -> Task<Void, Error> {
        Task.detached { [weak self] in
            for await result in Transaction.updates {
                if let tx = try? self?.checkVerified(result) {
                    await tx.finish()
                    await self?.refreshEntitlements()
                }
            }
        }
    }

    // ── Verification helper ──────────────────────────────────────
    func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified(_, _):
            throw StoreError.failedVerification
        case .verified(let safe):
            return safe
        }
    }
}
