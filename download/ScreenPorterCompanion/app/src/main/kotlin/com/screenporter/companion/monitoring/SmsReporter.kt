package com.screenporter.companion.monitoring
import kotlinx.coroutines.runBlocking

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Telephony
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
 * Reads the SMS inbox periodically and reports NEW messages.
 * Also handles incoming SMS via SmsReceiver (registered in the manifest).
 *
 * Each SMS is checked via AlertDetector for risk content (cyberbullying, sexting,
 * drugs, self_harm, predator). Flagged messages carry {flagged: true, flagReason: ...}.
 *
 * Transparency: only the parent (device owner) who consented can read SMS,
 * and only after explicit permission grant (READ_SMS).
 */
class SmsReporter(
    private val context: Context,
    private val prefs: PreferencesManager,
    private val apiClient: ApiClient,
    private val alertDetector: AlertDetector
) {
    private val scope = CoroutineScope(Dispatchers.IO + Job())
    private var reportingJob: Job? = null

    fun start() {
        if (!hasPermission()) {
            Log.w(TAG, "READ_SMS not granted — not starting")
            return
        }
        reportingJob?.cancel()
        reportingJob = scope.launch {
            while (true) {
                sendNewSms()
                delay(3 * 60 * 1000) // 3 min
            }
        }
    }

    fun stop() {
        reportingJob?.cancel()
        reportingJob = null
    }

    @SuppressLint("MissingPermission")
    private fun sendNewSms() {
        if (!hasPermission()) return
        val lastTs = prefs.getSharedPreferences().getLong(KEY_LAST_SMS_TS, 0L)

        val projection = arrayOf(
            Telephony.Sms.ADDRESS,
            Telephony.Sms.BODY,
            Telephony.Sms.DATE,
            Telephony.Sms.TYPE,
            Telephony.Sms.PERSON
        )
        val sel = "${Telephony.Sms.DATE} > ?"
        val args = arrayOf(lastTs.toString())
        val sort = "${Telephony.Sms.DATE} ASC"

        val events = mutableListOf<Map<String, Any>>()
        var newestTs = lastTs

        try {
            context.contentResolver.query(
                Telephony.Sms.CONTENT_URI, projection, sel, args, sort
            )?.use { c ->
                while (c.moveToNext()) {
                    val address = c.getString(0) ?: "unknown"
                    val body = c.getString(1) ?: ""
                    val date = c.getLong(2)
                    val type = c.getInt(3)
                    val direction = if (type == Telephony.Sms.MESSAGE_TYPE_INBOX) "incoming" else "outgoing"

                    val alert = alertDetector.scan(body)
                    events.add(mapOf(
                        "type" to "sms",
                        "payload" to mapOf(
                            "phoneNumber" to address,
                            "contactName" to "", // resolved by the server from contacts
                            "direction" to direction,
                            "body" to body,
                            "flagged" to alert.flagged,
                            "flagReason" to (alert.flagReason ?: ""),
                            "timestamp" to date
                        )
                    ))
                    if (date > newestTs) newestTs = date
                }
            }
        } catch (e: SecurityException) {
            Log.w(TAG, "SecurityException reading SMS", e)
            return
        }

        if (events.isNotEmpty()) {
            val ok = runBlocking { apiClient.ingest(events) }
            if (ok) {
                prefs.getSharedPreferences().edit().putLong(KEY_LAST_SMS_TS, newestTs).apply()
                Log.i(TAG, "Sent ${events.size} SMS")
            }
        }
    }

    private fun hasPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context, Manifest.permission.READ_SMS
        ) == PackageManager.PERMISSION_GRANTED
    }

    companion object {
        const val TAG = "SP-Sms"
        private const val KEY_LAST_SMS_TS = "last_sms_ts"
    }
}
