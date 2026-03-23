import Foundation
import Capacitor
import HealthKit

@objc(HealthKitPlugin)
public class HealthKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthKitPlugin"
    public let jsName = "HealthKitPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "querySteps", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queryActiveEnergy", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queryDistance", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queryWeight", returnType: CAPPluginReturnPromise),
    ]

    private let healthStore = HKHealthStore()

    // MARK: - isAvailable

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    // MARK: - requestAuthorization

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("HealthKit is not available on this device")
            return
        }

        let readTypes: Set<HKObjectType> = [
            HKQuantityType.quantityType(forIdentifier: .stepCount)!,
            HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)!,
            HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning)!,
            HKQuantityType.quantityType(forIdentifier: .bodyMass)!,
        ]

        healthStore.requestAuthorization(toShare: nil, read: readTypes) { success, error in
            if let error = error {
                call.reject("Authorization failed: \(error.localizedDescription)")
                return
            }
            // Note: `success` only means the dialog was shown, not that the user granted access.
            // HealthKit does not reveal whether the user tapped Allow or Don't Allow.
            call.resolve(["granted": success])
        }
    }

    // MARK: - querySteps

    @objc func querySteps(_ call: CAPPluginCall) {
        queryDailySum(call, typeIdentifier: .stepCount, unit: HKUnit.count(), key: "steps")
    }

    // MARK: - queryActiveEnergy

    @objc func queryActiveEnergy(_ call: CAPPluginCall) {
        queryDailySum(call, typeIdentifier: .activeEnergyBurned, unit: HKUnit.kilocalorie(), key: "activeEnergy")
    }

    // MARK: - queryDistance

    @objc func queryDistance(_ call: CAPPluginCall) {
        queryDailySum(call, typeIdentifier: .distanceWalkingRunning, unit: HKUnit.meterUnit(with: .kilo), key: "distance")
    }

    // MARK: - queryWeight (most recent sample)

    @objc func queryWeight(_ call: CAPPluginCall) {
        guard let sampleType = HKQuantityType.quantityType(forIdentifier: .bodyMass) else {
            call.reject("Body mass type unavailable")
            return
        }

        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        let query = HKSampleQuery(sampleType: sampleType, predicate: nil, limit: 1, sortDescriptors: [sortDescriptor]) { _, samples, error in
            if let error = error {
                call.reject("Weight query failed: \(error.localizedDescription)")
                return
            }
            guard let sample = samples?.first as? HKQuantitySample else {
                call.resolve(["value": NSNull(), "date": NSNull()])
                return
            }
            let kg = sample.quantity.doubleValue(for: HKUnit.gramUnit(with: .kilo))
            let lbs = kg * 2.20462
            let iso = ISO8601DateFormatter().string(from: sample.startDate)
            call.resolve(["value_kg": kg, "value_lbs": lbs, "date": iso])
        }
        healthStore.execute(query)
    }

    // MARK: - Private helpers

    /// Generic daily-sum aggregation using HKStatisticsCollectionQuery.
    private func queryDailySum(_ call: CAPPluginCall, typeIdentifier: HKQuantityTypeIdentifier, unit: HKUnit, key: String) {
        guard let quantityType = HKQuantityType.quantityType(forIdentifier: typeIdentifier) else {
            call.reject("Quantity type unavailable")
            return
        }

        guard let startDateStr = call.getString("startDate"),
              let endDateStr   = call.getString("endDate") else {
            call.reject("startDate and endDate are required (YYYY-MM-DD)")
            return
        }

        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        fmt.timeZone  = TimeZone.current

        guard let startDate = fmt.date(from: startDateStr),
              let endDate   = fmt.date(from: endDateStr) else {
            call.reject("Invalid date format. Use YYYY-MM-DD.")
            return
        }

        // End of endDate day
        let calendar = Calendar.current
        let anchorDate = calendar.startOfDay(for: startDate)
        let endOfDay = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: endDate))!

        let interval = DateComponents(day: 1)
        let predicate = HKQuery.predicateForSamples(withStart: anchorDate, end: endOfDay, options: .strictStartDate)

        let query = HKStatisticsCollectionQuery(
            quantityType: quantityType,
            quantitySamplePredicate: predicate,
            options: .cumulativeSum,
            anchorDate: anchorDate,
            intervalComponents: interval
        )

        query.initialResultsHandler = { _, results, error in
            if let error = error {
                call.reject("Query failed: \(error.localizedDescription)")
                return
            }

            var values: [[String: Any]] = []
            results?.enumerateStatistics(from: anchorDate, to: endOfDay) { statistics, _ in
                let dateStr = fmt.string(from: statistics.startDate)
                let sum = statistics.sumQuantity()?.doubleValue(for: unit) ?? 0
                values.append(["date": dateStr, "value": round(sum * 100) / 100])
            }

            call.resolve(["values": values])
        }

        healthStore.execute(query)
    }
}
