package com.screenporter.companion.monitoring

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.telephony.SmsMessage
import android.util.Log
import com.screenporter.companion.ScreenPorterApp
import com.screenporter.companion.network.ApiClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * SMS BroadcastReceiver — captures incoming SMS in real-time (no polling delay).
 * Reports the new SMS to the server immediately via /api/agent/ingest.
 *
 * Transparency: only the device owner who consented + READ_SMS permission can
 * capture incoming SMS. The BroadcastReceiver uses SMS_RECEIVED_ACTION which
 * is publicly available to apps with the READ_SMS permission.
 *
 * Note: priority 999 is high but not exclusive — other SMS apps still receive
 * the broadcast. This is intentional and open.
 */
class SmsReceiver : BroadcastReceiver() {

    companion object {
        const val TAG = "SP-SmsReceiver"
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val detector = AlertDetector()

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        if (!com.screenporter.companion.util.PermissionState.isSmsGranted(context)) return

        val app = context.applicationContext as ScreenPorterApp
        if (!app.prefs.consentSigned) return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        val api = ApiClient(app.prefs)

        val events = messages.mapNotNull { sms: SmsMessage ->
            val body = sms.displayMessageBody ?: return@mapNotNull null
            val alert = detector.scan(body)
            mapOf(
                "type" to "sms",
                "payload" to mapOf(
                    "phoneNumber" to (sms.displayOriginatingAddress ?: "unknown"),
                    "contactName" to "",
                    "direction" to "incoming",
                    "body" to body,
                    "flagged" to alert.flagged,
                    "flagReason" to (alert.flagReason ?: ""),
                    "timestamp" to (sms.timestampMillis ?: System.currentTimeMillis())
                )
            )
        }

        if (events.isNotEmpty()) {
            scope.launch {
                val ok = api.ingest(events)
                if (ok) Log.i(TAG, "Sent ${events.size} incoming SMS")
                else Log.w(TAG, "Failed to send SMS events")
            }
        }
    }
}
