package com.screenporter.companion.monitoring
import kotlinx.coroutines.runBlocking

import android.Manifest
import android.annotation.SuppressLint
import android.app.AppOpsManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Process
import android.provider.Settings
import android.util.Log
import com.screenporter.companion.network.ApiClient
import com.screenporter.companion.util.PreferencesManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Reports per-app foreground usage time using UsageStatsManager.
 *
 * Requires PACKAGE_USAGE_STATS — a special permission that must be granted
 * via Settings.ACTION_USAGE_ACCESS_SETTINGS (not a runtime permission).
 *
 * Each hour, queries usage for the last hour and emits events:
 * {type:"app", payload:{packageName, appName, foregroundMs, dataUsageBytes, timestamp}}
 *
 * Transparency: usage stats are only readable by the device owner with explicit
 * Settings permission. No content of apps is read — only which apps were used
 * and for how long.
 */
class AppUsageReporter(
    private val context: Context,
    private val prefs: PreferencesManager,
    private val apiClient: ApiClient
) {
    private val scope = CoroutineScope(Dispatchers.IO + Job())
    private var reportingJob: Job? = null

    fun start() {
        if (!hasPermission()) {
            Log.w(TAG, "PACKAGE_USAGE_STATS not granted — not starting")
            return
        }
        reportingJob?.cancel()
        reportingJob = scope.launch {
            while (true) {
                sendHourlyUsage()
                delay(60 * 60 * 1000) // 1 hour
            }
        }
    }

    fun stop() {
        reportingJob?.cancel()
        reportingJob = null
    }

    @SuppressLint("MissingPermission")
    private fun sendHourlyUsage() {
        if (!hasPermission()) return
        val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val now = System.currentTimeMillis()
        val hourAgo = now - 60 * 60 * 1000
        val stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_BEST, hourAgo, now)
        if (stats.isNullOrEmpty()) return

        val pm = context.packageManager
        val events = mutableListOf<Map<String, Any>>()
        for (s in stats) {
            if (s.totalTimeInForeground <= 0) continue
            val appName = try {
                val info = pm.getApplicationInfo(s.packageName, 0)
                pm.getApplicationLabel(info).toString()
            } catch (e: Exception) { s.packageName }

            events.add(mapOf(
                "type" to "app",
                "payload" to mapOf(
                    "packageName" to s.packageName,
                    "appName" to appName,
                    "foregroundMs" to s.totalTimeInForeground,
                    "dataUsageBytes" to 0, // not directly accessible without extra permissions
                    "timestamp" to hourAgo
                )
            ))
        }
        if (events.isNotEmpty()) {
            val ok = runBlocking { apiClient.ingest(events) }
            if (ok) Log.i(TAG, "Sent ${events.size} app usage events")
        }
    }

    fun hasPermission(): Boolean {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            appOps.unsafeCheckOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                context.packageName
            )
        } else {
            @Suppress("DEPRECATION")
            appOps.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                context.packageName
            )
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }

    companion object {
        const val TAG = "SP-AppUsage"
    }
}
