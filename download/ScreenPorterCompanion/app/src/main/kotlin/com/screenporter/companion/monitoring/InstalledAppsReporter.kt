package com.screenporter.companion.monitoring

import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import com.screenporter.companion.network.ApiClient
import com.screenporter.companion.util.PreferencesManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Reports the full list of installed apps to the server via /api/agent/ingest.
 *
 * Emits a single batch event:
 *   {type:"installed_apps", payload:{apps:[{packageName, appName, versionName,
 *    versionCode, systemApp}]}}
 *
 * Needs no runtime permission — only QUERY_ALL_PACKAGES declared in the manifest
 * so getInstalledPackages() returns every app on Android 11+ (API 30+).
 *
 * Runs once on startup (fresh inventory each session) and then refreshes every
 * 6 hours so newly-installed/removed apps are reflected.
 *
 * Transparency: only the name/version of each app is read — never its contents.
 */
class InstalledAppsReporter(
    private val context: Context,
    private val prefs: PreferencesManager,
    private val apiClient: ApiClient
) {
    private val scope = CoroutineScope(Dispatchers.IO + Job())
    private var reportingJob: Job? = null

    fun start() {
        reportingJob?.cancel()
        reportingJob = scope.launch {
            while (true) {
                sendInventory()
                delay(6 * 60 * 60 * 1000L) // 6 h
            }
        }
    }

    fun stop() {
        reportingJob?.cancel()
        reportingJob = null
    }

    private suspend fun sendInventory() {
        val pm = context.packageManager
        val apps = mutableListOf<Map<String, Any>>()
        try {
            val packages = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                pm.getInstalledPackages(PackageManager.PackageInfoFlags.of(0))
            } else {
                @Suppress("DEPRECATION")
                pm.getInstalledPackages(0)
            }
            for (pkg in packages) {
                val appInfo = pkg.applicationInfo ?: continue
                val isSystem = (appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0
                val label = try {
                    pm.getApplicationLabel(appInfo).toString()
                } catch (e: Exception) {
                    pkg.packageName
                }
                @Suppress("DEPRECATION")
                val versionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    pkg.longVersionCode
                } else {
                    pkg.versionCode.toLong()
                }
                apps.add(mapOf(
                    "packageName" to pkg.packageName,
                    "appName" to label,
                    "versionName" to (pkg.versionName ?: ""),
                    "versionCode" to versionCode,
                    "systemApp" to isSystem
                ))
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to enumerate installed apps", e)
            return
        }

        if (apps.isEmpty()) {
            Log.w(TAG, "No installed apps found (QUERY_ALL_PACKAGES?)")
            return
        }

        // O servidor aceita até 500 por batch; divide em pedaços se necessário.
        var sent = 0
        apps.chunked(400).forEach { chunk ->
            val event = mapOf(
                "type" to "installed_apps",
                "payload" to mapOf("apps" to chunk)
            )
            val ok = apiClient.ingest(listOf(event))
            if (ok) sent += chunk.size
            else Log.w(TAG, "Failed to send installed-apps chunk (${chunk.size})")
        }
        Log.i(TAG, "Sent $sent/${apps.size} installed apps")
    }

    companion object {
        const val TAG = "SP-InstalledApps"
    }
}
