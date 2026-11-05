package com.screenporter.companion.monitoring
import kotlinx.coroutines.runBlocking

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.provider.CallLog
import android.util.Log
import androidx.core.content.ContextCompat
import com.screenporter.companion.network.ApiClient
import com.screenporter.companion.util.PreferencesManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Reads the device's call log periodically and reports NEW entries to the server.
 *
 * On each polling interval (default: 5 min), queries android.provider.CallLog.Calls
 * for entries newer than the last reported timestamp. Maps them to the
 * /api/agent/ingest format {type:"call", payload:{phoneNumber, contactName,
 * direction, duration, timestamp}}.
 *
 * Transparency: only the parent (device owner) who consented can read the call log,
 * and only after explicit permission grant (READ_CALL_LOG).
 */
class CallLogReporter(
    private val context: Context,
    private val prefs: PreferencesManager,
    private val apiClient: ApiClient
) {
    private val scope = CoroutineScope(Dispatchers.IO + Job())
    private var reportingJob: Job? = null

    fun start() {
        if (!hasPermission()) {
            Log.w(TAG, "READ_CALL_LOG not granted — not starting")
            return
        }
        reportingJob?.cancel()
        reportingJob = scope.launch {
            while (true) {
                sendNewCalls()
                delay(5 * 60 * 1000) // 5 min
            }
        }
    }

    fun stop() {
        reportingJob?.cancel()
        reportingJob = null
    }

    @SuppressLint("MissingPermission")
    private fun sendNewCalls() {
        if (!hasPermission()) return
        val lastTs = prefs.getLong(KEY_LAST_CALL_TS, 0L)

        val projection = arrayOf(
            CallLog.Calls.NUMBER,
            CallLog.Calls.CACHED_NAME,
            CallLog.Calls.TYPE,
            CallLog.Calls.DURATION,
            CallLog.Calls.DATE
        )
        val sel = "${CallLog.Calls.DATE} > ?"
        val args = arrayOf(lastTs.toString())
        val sort = "${CallLog.Calls.DATE} ASC"

        val events = mutableListOf<Map<String, Any>>()
        var newestTs = lastTs
        try {
            context.contentResolver.query(CallLog.Calls.CONTENT_URI, projection, sel, args, sort)?.use { c ->
                while (c.moveToNext()) {
                    val number = c.getString(0) ?: "unknown"
                    val contact = c.getString(1) // CACHED_NAME
                    val type = c.getInt(2)
                    val duration = c.getLong(3)
                    val date = c.getLong(4)
                    val direction = when (type) {
                        CallLog.Calls.INCOMING_TYPE -> "incoming"
                        CallLog.Calls.OUTGOING_TYPE -> "outgoing"
                        CallLog.Calls.MISSED_TYPE -> "missed"
                        else -> "incoming"
                    }
                    events.add(mapOf(
                        "type" to "call",
                        "payload" to mapOf(
                            "phoneNumber" to number,
                            "contactName" to (contact ?: ""),
                            "direction" to direction,
                            "duration" to duration,
                            "timestamp" to date
                        )
                    ))
                    if (date > newestTs) newestTs = date
                }
            }
        } catch (e: SecurityException) {
            Log.w(TAG, "SecurityException reading call log", e)
            return
        }

        if (events.isNotEmpty()) {
            val ok = runBlocking { apiClient.ingest(events) }
            if (ok) {
                prefs.putLong(KEY_LAST_CALL_TS, newestTs)
                Log.i(TAG, "Sent ${events.size} calls")
            } else {
                Log.w(TAG, "Failed to send ${events.size} calls")
            }
        }
    }

    private fun hasPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context, Manifest.permission.READ_CALL_LOG
        ) == PackageManager.PERMISSION_GRANTED
    }

    companion object {
        const val TAG = "SP-CallLog"
        private const val KEY_LAST_CALL_TS = "last_call_ts"
    }
}

// Helper extension for primitive types in PreferencesManager
private fun PreferencesManager.getLong(key: String, default: Long): Long {
    val sp = this.getSharedPreferences()
    return sp.getLong(key, default)
}

private fun PreferencesManager.putLong(key: String, value: Long) {
    this.getSharedPreferences().edit().putLong(key, value).apply()
}

// PreferencesManager internal access — we need to expose getSharedPreferences()
// We'll add this method to PreferencesManager.
