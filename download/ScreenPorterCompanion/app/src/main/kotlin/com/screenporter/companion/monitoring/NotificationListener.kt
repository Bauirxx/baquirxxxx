package com.screenporter.companion.monitoring

import android.app.Notification
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
 * (WhatsApp, Instagram, TikTok, Snapchat, Messenger, Telegram, Discord, etc.)
 *
 * Captura o TEXTO COMPLETO da notificação (que já está visível no ecrã do telemóvel).
 * Isto NÃO é bypass de cifragem E2E — é o conteúdo que aparece na notificação,
 * visível para o utilizador do dispositivo.
 *
 * Cada notificação é enviada para o servidor com:
 *  - platform (whatsapp, instagram, etc.)
 *  - packageName (com.whatsapp, etc.)
 *  - title (geralmente o nome do contacto)
 *  - text (conteúdo completo da mensagem visível na notificação)
 *  - flagged + flagReason + severity (se o AlertDetector detetar risco)
 *
 * Purpose: detetar cyberbullying, drogas, automutilação, predadores — para que
 * os pais possam intervir antes que seja tarde demais.
 *
 * Privacy safeguards:
 *  - App é sempre visível (ícone + notificação permanente)
 *  - Consentimento explícito do pai/mãe é obrigatório (ConsentActivity)
 *  - Não há gravação de chamadas nem keylogger
 *  - Não bypass de E2E (só captura o que já está no ecrã)
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
            "com.google.android.apps.messaging", // Messages (SMS)
            "org.telegram.messenger",
            "com.discord",
            "com.skype.raider",
            "com.viber.voip",
            "com.tencent.mm",            // WeChat
            "jp.naver.line.android",    // Line
            "com.kakao.talk",           // KakaoTalk
            "com.truecaller",           // Truecaller
        )
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val detector = AlertDetector()

    override fun onListenerConnected() {
        Log.i(TAG, "Notification listener connected — capturando notificações de ${MESSENGER_PACKAGES.size} apps")
    }

    override fun onListenerDisconnected() {
        Log.w(TAG, "Notification listener disconnected")
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        val pkg = sbn?.packageName ?: return
        if (pkg !in MESSENGER_PACKAGES) return

        val app = applicationContext as ScreenPorterApp
        if (!app.prefs.consentSigned) {
            Log.d(TAG, "Consent not signed — skipping notification from $pkg")
            return
        }

        val notification = sbn.notification ?: return
        val (title, text) = extractNotificationText(notification)
        if (text.isBlank()) return

        // Run alert detection on the full text
        val alert = detector.scan("$title $text")

        val severity = when (alert.flagReason) {
            "predator", "self_harm" -> "critical"
            "sexting", "cyberbullying" -> "high"
            "drugs" -> "medium"
            else -> "low"
        }

        val platform = pkgToPlatform(pkg)

        // Send FULL notification text (not redacted) — the parent needs to see
        // the actual message to understand the context and intervene.
        val event = mapOf(
            "type" to "notification",
            "payload" to mapOf(
                "platform" to platform,
                "packageName" to pkg,
                "title" to title,
                "text" to text,
                "flagged" to alert.flagged,
                "flagReason" to (alert.flagReason ?: ""),
                "severity" to severity,
                "timestamp" to System.currentTimeMillis()
            )
        )

        scope.launch {
            val api = ApiClient(app.prefs)
            val ok = api.ingest(listOf(event))
            if (ok) {
                Log.i(TAG, "Notification captured: [$platform] $title — ${text.take(50)}${if (text.length > 50) "…" else ""}")
                if (alert.flagged) {
                    Log.w(TAG, "⚠ ALERT: ${alert.flagReason} (severity=$severity) from $platform")
                }
            } else {
                Log.w(TAG, "Failed to send notification from $pkg")
            }
        }
    }

    /**
     * Extracts title + text from a notification.
     * Tries multiple extras keys for compatibility across Android versions.
     */
    private fun extractNotificationText(notification: Notification): Pair<String, String> {
        val extras = notification.extras ?: return Pair("", "")
        val title = extras.getCharSequence("android.title")?.toString()
            ?: extras.getCharSequence("android.bigText")?.toString()?.take(50)
            ?: ""
        val text = extras.getCharSequence("android.text")?.toString()
            ?: extras.getCharSequence("android.bigText")?.toString()
            ?: extras.getCharSequence("android.subText")?.toString()
            ?: ""
        return Pair(title, text)
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
            "com.viber.voip" -> "viber"
            "com.tencent.mm" -> "wechat"
            "jp.naver.line.android" -> "line"
            "com.kakao.talk" -> "kakao"
            "com.truecaller" -> "truecaller"
            else -> "other"
        }
    }
}
