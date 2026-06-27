package com.physiquecrafters.app

import android.content.Intent
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

/**
 * Android Health Connect bridge.
 *
 * JS counterpart: src/plugins/HealthConnectPlugin.ts
 * Mirrors the same method names + return shapes as the iOS HealthKit plugin
 * (ios-plugin/HealthKitPlugin.swift) so src/hooks/useHealthSync.ts can call
 * either without branching beyond plugin selection.
 *
 * Daily aggregation is done in the local timezone, matching the iOS plugin
 * (HEALTH_SYNC_INVARIANTS.md #1 — local-day invariant).
 */
@CapacitorPlugin(name = "HealthConnectPlugin")
class HealthConnectPlugin : Plugin() {

    private val permissions = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
    )

    private val dateFmt: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd")

    private fun client(): HealthConnectClient? = try {
        HealthConnectClient.getOrCreate(context)
    } catch (_: Throwable) {
        null
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val status = HealthConnectClient.getSdkStatus(context)
        val available = status == HealthConnectClient.SDK_AVAILABLE
        val res = JSObject()
        res.put("available", available)
        call.resolve(res)
    }

    @PluginMethod
    fun requestAuthorization(call: PluginCall) {
        val hc = client()
        if (hc == null) {
            call.reject("Health Connect not available on this device.")
            return
        }
        CoroutineScope(Dispatchers.Main).launch {
            try {
                val granted = hc.permissionController.getGrantedPermissions()
                if (granted.containsAll(permissions)) {
                    val res = JSObject(); res.put("granted", true); call.resolve(res); return@launch
                }
                val contract = PermissionController.createRequestPermissionResultContract()
                val intent: Intent = contract.createIntent(context, permissions)
                saveCall(call)
                startActivityForResult(call, intent, "permResult")
            } catch (e: Throwable) {
                call.reject("Health Connect authorization failed: ${e.message}")
            }
        }
    }

    @ActivityCallback
    private fun permResult(call: PluginCall, result: ActivityResult) {
        val hc = client() ?: return call.reject("Health Connect not available.")
        CoroutineScope(Dispatchers.Main).launch {
            val granted = hc.permissionController.getGrantedPermissions()
            val ok = granted.containsAll(permissions)
            val res = JSObject(); res.put("granted", ok); call.resolve(res)
        }
    }

    private fun parseRange(call: PluginCall): Pair<Instant, Instant>? {
        val s = call.getString("startDate") ?: return null
        val e = call.getString("endDate") ?: return null
        return try {
            val start = LocalDate.parse(s).atStartOfDay(ZoneId.systemDefault()).toInstant()
            val end = LocalDate.parse(e).plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant()
            start to end
        } catch (_: Throwable) { null }
    }

    private fun toLocalDateKey(t: Instant): String =
        ZonedDateTime.ofInstant(t, ZoneId.systemDefault()).toLocalDate().format(dateFmt)

    @PluginMethod
    fun querySteps(call: PluginCall) = queryAggregated(call, "steps") { hc, range ->
        val resp = hc.readRecords(ReadRecordsRequest(StepsRecord::class, TimeRangeFilter.between(range.first, range.second)))
        val byDay = mutableMapOf<String, Double>()
        for (r in resp.records) {
            val key = toLocalDateKey(r.startTime)
            byDay[key] = (byDay[key] ?: 0.0) + r.count.toDouble()
        }
        byDay
    }

    @PluginMethod
    fun queryActiveEnergy(call: PluginCall) = queryAggregated(call, "activeEnergy") { hc, range ->
        val resp = hc.readRecords(ReadRecordsRequest(ActiveCaloriesBurnedRecord::class, TimeRangeFilter.between(range.first, range.second)))
        val byDay = mutableMapOf<String, Double>()
        for (r in resp.records) {
            val key = toLocalDateKey(r.startTime)
            byDay[key] = (byDay[key] ?: 0.0) + r.energy.inKilocalories
        }
        byDay
    }

    @PluginMethod
    fun queryDistance(call: PluginCall) = queryAggregated(call, "distance") { hc, range ->
        val resp = hc.readRecords(ReadRecordsRequest(DistanceRecord::class, TimeRangeFilter.between(range.first, range.second)))
        val byDay = mutableMapOf<String, Double>()
        for (r in resp.records) {
            val key = toLocalDateKey(r.startTime)
            // useHealthSync stores km
            byDay[key] = (byDay[key] ?: 0.0) + (r.distance.inMeters / 1000.0)
        }
        byDay
    }

    private fun queryAggregated(
        call: PluginCall,
        kind: String,
        block: suspend (HealthConnectClient, Pair<Instant, Instant>) -> Map<String, Double>
    ) {
        val hc = client() ?: return call.reject("Health Connect not available.")
        val range = parseRange(call) ?: return call.reject("Invalid date range for $kind.")
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val byDay = block(hc, range)
                val arr = JSArray()
                byDay.toSortedMap().forEach { (date, value) ->
                    val o = JSObject(); o.put("date", date); o.put("value", value); arr.put(o)
                }
                val res = JSObject(); res.put("values", arr)
                call.resolve(res)
            } catch (e: Throwable) {
                call.reject("Failed to query $kind: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun querySleep(call: PluginCall) {
        val hc = client() ?: return call.reject("Health Connect not available.")
        val range = parseRange(call) ?: return call.reject("Invalid date range for sleep.")
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val resp = hc.readRecords(ReadRecordsRequest(SleepSessionRecord::class, TimeRangeFilter.between(range.first, range.second)))
                // Bucket sessions by the local wake-date so a session that
                // crosses midnight is attributed to the day the user woke up.
                data class Bucket(var totalMin: Long = 0, var deep: Long = 0, var rem: Long = 0, var light: Long = 0, var awake: Long = 0,
                                  var bedtime: Instant? = null, var wake: Instant? = null)
                val buckets = mutableMapOf<String, Bucket>()
                for (s in resp.records) {
                    val key = toLocalDateKey(s.endTime)
                    val b = buckets.getOrPut(key) { Bucket() }
                    val sessionMin = java.time.Duration.between(s.startTime, s.endTime).toMinutes()
                    b.totalMin += sessionMin
                    if (b.bedtime == null || s.startTime.isBefore(b.bedtime)) b.bedtime = s.startTime
                    if (b.wake == null || s.endTime.isAfter(b.wake)) b.wake = s.endTime
                    for (stage in s.stages) {
                        val mins = java.time.Duration.between(stage.startTime, stage.endTime).toMinutes()
                        when (stage.stage) {
                            SleepSessionRecord.STAGE_TYPE_DEEP -> b.deep += mins
                            SleepSessionRecord.STAGE_TYPE_REM -> b.rem += mins
                            SleepSessionRecord.STAGE_TYPE_LIGHT,
                            SleepSessionRecord.STAGE_TYPE_SLEEPING -> b.light += mins
                            SleepSessionRecord.STAGE_TYPE_AWAKE,
                            SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED -> b.awake += mins
                        }
                    }
                }
                val arr = JSArray()
                buckets.toSortedMap().forEach { (date, b) ->
                    val o = JSObject()
                    o.put("date", date)
                    o.put("totalMinutes", b.totalMin)
                    o.put("deepMinutes", b.deep)
                    o.put("remMinutes", b.rem)
                    o.put("lightMinutes", b.light)
                    o.put("awakeMinutes", b.awake)
                    if (b.bedtime != null) o.put("bedtimeAt", b.bedtime.toString())
                    if (b.wake != null) o.put("wakeAt", b.wake.toString())
                    arr.put(o)
                }
                val res = JSObject(); res.put("values", arr)
                call.resolve(res)
            } catch (e: Throwable) {
                call.reject("Failed to query sleep: ${e.message}")
            }
        }
    }
}
