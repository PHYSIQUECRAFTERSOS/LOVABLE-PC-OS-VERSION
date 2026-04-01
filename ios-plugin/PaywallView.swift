// PaywallView.swift
// Add to Xcode: App/App/Plugins/PaywallView.swift
//
// SwiftUI paywall — uses StoreKitManager for all StoreKit logic.

import SwiftUI
import StoreKit

@available(iOS 15.0, *)
struct PaywallView: View {
    @StateObject private var storeManager = StoreKitManager.shared
    @Environment(\.dismiss) private var dismiss

    @State private var isPurchasing = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 24) {

                    // ── Header ────────────────────────────
                    VStack(spacing: 8) {
                        Image(systemName: "star.circle.fill")
                            .font(.system(size: 60))
                            .foregroundColor(.yellow)

                        Text("Physique Crafters Pro")
                            .font(.title.bold())

                        Text("Unlock your full coaching experience")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    .padding(.top, 32)

                    // ── Feature list ──────────────────────
                    VStack(alignment: .leading, spacing: 12) {
                        featureRow("Full training programs")
                        featureRow("Custom nutrition plans")
                        featureRow("Direct coach messaging")
                        featureRow("Progress analytics")
                        featureRow("Community & challenges")
                    }
                    .padding(.horizontal)

                    // ── Products ──────────────────────────
                    if storeManager.products.isEmpty {
                        ProgressView("Loading plans…")
                            .padding()
                    } else {
                        VStack(spacing: 12) {
                            ForEach(storeManager.products, id: \.id) { product in
                                Button {
                                    Task { await purchaseProduct(product) }
                                } label: {
                                    HStack {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(product.displayName)
                                                .font(.headline)
                                            Text(product.description)
                                                .font(.caption)
                                                .foregroundColor(.secondary)
                                        }
                                        Spacer()
                                        Text(product.displayPrice)
                                            .font(.headline)
                                    }
                                    .padding()
                                    .background(Color(.systemGray6))
                                    .cornerRadius(12)
                                }
                                .disabled(isPurchasing)
                            }
                        }
                        .padding(.horizontal)
                    }

                    // ── Error ─────────────────────────────
                    if let errorMessage {
                        Text(errorMessage)
                            .font(.caption)
                            .foregroundColor(.red)
                            .padding(.horizontal)
                    }

                    // ── Restore ───────────────────────────
                    Button("Restore Purchases") {
                        Task { await restore() }
                    }
                    .font(.footnote)
                    .padding(.bottom, 32)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }

    // ── Helpers ──────────────────────────────────────────────────

    private func featureRow(_ text: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundColor(.green)
            Text(text)
                .font(.body)
        }
    }

    private func purchaseProduct(_ product: Product) async {
        isPurchasing = true
        errorMessage = nil
        do {
            try await storeManager.purchase(product.id)
            dismiss()
        } catch is CancellationError {
            // user cancelled — no error
        } catch {
            errorMessage = error.localizedDescription
        }
        isPurchasing = false
    }

    private func restore() async {
        isPurchasing = true
        errorMessage = nil
        do {
            try await storeManager.restorePurchases()
            if storeManager.hasActiveSubscription { dismiss() }
        } catch {
            errorMessage = error.localizedDescription
        }
        isPurchasing = false
    }
}
