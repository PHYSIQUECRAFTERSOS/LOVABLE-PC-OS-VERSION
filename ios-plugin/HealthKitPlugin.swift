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
        CAPPluginMethod(name: "querySleep", returnType: CAPPluginReturnPromise),
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

        var readTypes: Set<HKObjectType> = [
            HKQuantityType.quantityType(forIdentifier: .stepCount)!,
            HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)!,
            HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning)!,
            HKQuantityType.quantityType(forIdentifier: .bodyMass)!,
        ]
        if let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            readTypes.insert(sleepType)
        }

        healthStore.requestAuthorization(toShare: nil, read: readTypes) { success, error in
            if let error = error {
                call.reject("Authorization failed: \(error.localizedDescription)")
                return
            }
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

    // MARK: - querySleep
    //
    // Aggregates HKCategoryTypeSleepAnalysis samples per night.
    // A "night" is keyed to the wake date — the date a sample's endDate falls on (local TZ).
    // For each date we sum total time in bed, asleep, deep, REM, light, awake.
    // Returns minutes (rounded) plus earliest bedtime + latest wake timestamps.
    @objc func querySleep(_ call: CAPPluginCall) {
        guard let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
            call.reject("Sleep analysis type unavailable")
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

        let calendar = Calendar.current
        // Pull samples from start-of-startDate minus 12h (catch night-before bedtime),
        // through end-of-endDate.
        let queryStart = calendar.date(byAdding: .hour, value: -12, to: calendar.startOfDay(for: startDate))!
        let queryEnd = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: endDate))!

        let predicate = HKQuery.predicateForSamples(withStart: queryStart, end: queryEnd, options: [])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)

        let query = HKSampleQuery(sampleType: sleepType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, error in
            if let error = error {
                call.reject("Sleep query failed: \(error.localizedDescription)")
                return
            }

            // Per-date aggregation
            struct Agg {
                var inBed: TimeInterval = 0
                var asleep: TimeInterval = 0
                var deep: TimeInterval = 0
                var rem: TimeInterval = 0
                var light: TimeInterval = 0
                var awake: TimeInterval = 0
                var earliestStart: Date?
                var latestEnd: Date?
            }
            var byDate: [String: Agg] = [:]

            for sample in (samples as? [HKCategorySample]) ?? [] {
                let duration = sample.endDate.timeIntervalSince(sample.startDate)
                if duration <= 0 { continue }
                let dateKey = fmt.string(from: sample.endDate) // attribute to wake date
                var agg = byDate[dateKey] ?? Agg()

                let value = sample.value
                if #available(iOS 16.0, *) {
                    switch value {
                    case HKCategoryValueSleepAnalysis.inBed.rawValue:
                        agg.inBed += duration
                    case HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
                         HKCategoryValueSleepAnalysis.asleepCore.rawValue:
                        agg.asleep += duration
                        agg.light += duration
                    case HKCategoryValueSleepAnalysis.asleepDeep.rawValue:
                        agg.asleep += duration
                        agg.deep += duration
                    case HKCategoryValueSleepAnalysis.asleepREM.rawValue:
                        agg.asleep += duration
                        agg.rem += duration
                    case HKCategoryValueSleepAnalysis.awake.rawValue:
                        agg.awake += duration
                    default:
                        break
                    }
                } else {
                    // Pre-iOS 16: only inBed / asleep / awake exist
                    switch value {
                    case HKCategoryValueSleepAnalysis.inBed.rawValue:
                        agg.inBed += duration
                    case HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue:
                        agg.asleep += duration
                    case HKCategoryValueSleepAnalysis.awake.rawValue:
                        agg.awake += duration
                    default:
                        break
                    }
                }

                if agg.earliestStart == nil || sample.startDate < agg.earliestStart! {
                    agg.earliestStart = sample.startDate
                }
                if agg.latestEnd == nil || sample.endDate > agg.latestEnd! {
                    agg.latestEnd = sample.endDate
                }
                byDate[dateKey] = agg
            }

            let iso = ISO8601DateFormatter()
            var values: [[String: Any]] = []

            // Walk requested date range so empty dates can also be considered explicitly.
            var cursor = calendar.startOfDay(for: startDate)
            let last = calendar.startOfDay(for: endDate)
            while cursor <= last {
                let key = fmt.string(from: cursor)
                if let agg = byDate[key] {
                    let asleepMin = Int((agg.asleep / 60).rounded())
                    // If no asleep samples (older devices), fall back to inBed
                    let totalMin = asleepMin > 0 ? asleepMin : Int((agg.inBed / 60).rounded())
                    values.append([
                        "date": key,
                        "totalMinutes": totalMin,
                        "inBedMinutes": Int((agg.inBed / 60).rounded()),
                        "asleepMinutes": asleepMin,
                        "deepMinutes": Int((agg.deep / 60).rounded()),
                        "remMinutes": Int((agg.rem / 60).rounded()),
                        "lightMinutes": Int((agg.light / 60).rounded()),
                        "awakeMinutes": Int((agg.awake / 60).rounded()),
                        "bedtimeAt": agg.earliestStart.map { iso.string(from: $0) } as Any? ?? NSNull(),
                        "wakeAt": agg.latestEnd.map { iso.string(from: $0) } as Any? ?? NSNull(),
                    ])
                }
                cursor = calendar.date(byAdding: .day, value: 1, to: cursor)!
            }

            call.resolve(["values": values])
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
