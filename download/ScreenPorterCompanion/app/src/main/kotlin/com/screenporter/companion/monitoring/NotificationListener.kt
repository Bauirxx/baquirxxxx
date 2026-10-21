package com.screenporter.companion.monitoring

import android.app.Notification
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.screenporter.companion.ScreenPorterApp
import com.screenporter.companion.network.ApiClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * NotificationListenerService — captures notifications from messaging apps
 * (WhatsApp, Instagram, TikTok, Snapchat, Messenger) and runs AlertDetector
 * on the notification text.
 *
 * If a risk signal is detected (cyberbullying, sexting, drugs, self_harm, predator),
 * it sends an alert event to the server:
 *   {type:"alert", payload:{platform, severity, category, snippet, timestamp}}
 *
 * Privacy:
 *  - Only the FLAG + CATEGORY + REDACTED SNIPPET are sent (NOT the raw notification text).
 *  - Only messaging apps are scanned (filtered by package name).
 *  - No keylogging, no full message interception, no storage.
 *
 * Requires the user to enable the listener in:
 *   Settings > Notifications > Notification access > ScreenPorter
 */
class NotificationListener : NotificationListenerService() {

    companion object {
        const val TAG = "SP-NotifListener"
        val MESSENGER_PACKAGES = setOf(
            "com.whatsapp",
            "com.instagram.android",
            "com.zhiliaoapp.musically", // TikTok
            "com.snapchat.android",
            "com.facebook.orca",       // Messenger
            "com.facebook.katana",      // Facebook
            "com.google.android.apps.messaging", // Messages
            "org.telegram.messenger",
            "com.discord",
            "com.skype.raider"
        )
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var prefs: com.screenporter.companion.util.PreferencesManager
    private lateinit var api: ApiClient
    private val detector = AlertDetector()

    override fun onCreate() {
        super.onCreate()
        prefs = (application as ScreenPorterApp).prefs
        api = ApiClient(prefs)
    }

    override fun onListenerConnected() {
        Log.i(TAG, "Notification listener connected")
    }

    override fun onListenerDisconnected() {
        Log.w(TAG, "Notification listener disconnected")
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        val pkg = sbn?.packageName ?: return
        if (pkg !in MESSENGER_PACKAGES) return
        if (!prefs.consentSigned) return

        val notification = sbn.notification ?: return
        val text = extractNotificationText(notification) ?: return
        if (text.isBlank()) return

        val alert = detector.scan(text)
        if (!alert.flagged) return

        // Send alert event
        val severity = when (alert.flagReason) {
            "predator", "self_harm" -> "critical"
            "sexting", "cyberbullying" -> "high"
            "drugs" -> "medium"
            else -> "low"
        }
        val event = mapOf(
            "type" to "alert",
            "payload" to mapOf(
                "platform" to pkgToPlatform(pkg),
                "severity" to severity,
                "category" to (alert.flagReason ?: "unknown"),
                "snippet" to alert.snippet,
                "timestamp" to System.currentTimeMillis()
            )
        )
        scope.launch {
            val ok = api.ingest(listOf(event))
            if (ok) Log.i(TAG, "Alert sent: ${alert.flagReason} from $pkg")
            else Log.w(TAG, "Failed to send alert")
        }
    }

    private fun extractNotificationText(notification: Notification): String? {
        // Extract text from Notification.extras
        val extras = notification.extras ?: return null
        val title = extras.getCharSequence("android.title")?.toString() ?: ""
        val text = extras.getCharSequence("android.text")?.toString() ?: ""
        val bigText = extras.getCharSequence("android.bigText")?.toString() ?: ""
        return "$title $text $bigText"
    }

    private fun pkgToPlatform(pkg: String): String {
        return when (pkg) {
            "com.whatsapp" -> "whatsapp"
            "com.instagram.android" -> "instagram"
            "com.zhiliaoapp.musically" -> "tiktok"
            "com.snapchat.android" -> "snapchat"
            "com.facebook.orca" -> "messenger"
            "com.facebook.katana" -> "facebook"
            "com.google.android.apps.messaging" -> "sms"
            "org.telegram.messenger" -> "telegram"
            "com.discord" -> "discord"
            "com.skype.raider" -> "skype"
            else -> "other"
        }
    }
}
