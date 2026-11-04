package com.screenporter.companion.monitoring

import android.app.Notification
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Base64
import android.util.Log
import com.screenporter.companion.ScreenPorterApp
import com.screenporter.companion.network.ApiClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream

/**
 * NotificationListenerService — captures notifications from messaging apps
 * (WhatsApp, Instagram, TikTok, Snapchat, Messenger, Telegram, Discord, etc.)
 *
 * Captura o CONTEÚDO COMPLETO da notificação (que já está visível no ecrã do telemóvel):
 *  - Texto da mensagem (android.text, android.bigText, android.subText)
 *  - Histórico de mensagens da conversa (MessagingStyle.messages + historicMessages)
 *  - Imagens partilhadas (Notification.picture / EXTRA_PICTURE)
 *  - Áudios/voice notes (EXTRA_AUDIO_CONTENT_URI / EXTRA_BIG_PICTURE)
 *  - Imagens de pré-visualização (Notification.largeIcon, bigPicture)
 *
 * Isto NÃO é bypass de cifragem E2E — é o conteúdo que aparece na notificação,
 * visível para o utilizador do dispositivo. Para mensagens multimédia (fotos, áudios)
 * o WhatsApp mostra uma pré-visualização na notificação — nós capturamos essa pré-visualização.
 *
 * Cada notificação é enviada para o servidor com:
 *  - platform (whatsapp, instagram, etc.)
 *  - packageName (com.whatsapp, etc.)
 *  - title (geralmente o nome do contacto)
 *  - text (conteúdo textual completo, incluindo histórico da conversa)
 *  - hasImage + imageBase64 (pré-visualização JPEG, se houver)
 *  - hasAudio + audioUri (URI do áudio, se houver)
 *  - flagged + flagReason + severity (se o AlertDetector detetar risco)
 *
 * Purpose: detetar cyberbullying, drogas, automutilação, predadores — para que
 * os pais possam intervir antes que seja tarde demais. Fotos e áudios muitas vezes
 * contêm pistas que o texto não revela (imagens de nudez, áudios com ameaças, etc.)
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
            "com.samsung.android.messaging", // Samsung SMS
            "com.android.mms",          // AOSP SMS
            "com.google.android.gm",    // Gmail (às vezes relevante)
        )

        // Tamanho máximo do thumbnail JPEG base64 enviado no payload (50 KB)
        private const val MAX_IMAGE_BASE64_BYTES = 50_000
        // Dimensão máxima do thumbnail
        private const val THUMBNAIL_MAX_DIM = 400
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

        // Extrair todo o conteúdo possível da notificação
        val (title, text) = extractNotificationText(notification)
        val imageBase64 = extractImage(notification)
        val audioUri = extractAudioUri(notification)

        // Se não há texto, imagem nem áudio, não vale a pena enviar
        if (text.isBlank() && imageBase64 == null && audioUri == null) {
            Log.d(TAG, "Empty notification from $pkg — skip")
            return
        }

        // Detetar risco no texto (se houver texto)
        val alert = if (text.isNotBlank()) detector.scan(text) else null
        val severity = when (alert?.flagReason) {
            "predator", "self_harm" -> "critical"
            "sexting", "cyberbullying" -> "high"
            "drugs" -> "medium"
            else -> "low"
        }

        val platform = pkgToPlatform(pkg)

        val payload = mutableMapOf<String, Any>(
            "platform" to platform,
            "packageName" to pkg,
            "title" to title,
            "text" to text,
            "flagged" to (alert?.flagged ?: false),
            "flagReason" to (alert?.flagReason ?: ""),
            "severity" to severity,
            "timestamp" to System.currentTimeMillis()
        )
        if (imageBase64 != null) {
            payload["hasImage"] = true
            payload["imageBase64"] = imageBase64
        }
        if (audioUri != null) {
            payload["hasAudio"] = true
            payload["audioUri"] = audioUri
        }

        val event = mapOf(
            "type" to "notification",
            "payload" to payload
        )

        scope.launch {
            val api = ApiClient(app.prefs)
            val ok = api.ingest(listOf(event))
            if (ok) {
                val desc = buildString {
                    append("[$platform] $title")
                    if (text.isNotBlank()) append(" — ${text.take(40)}${if (text.length > 40) "…" else ""}")
                    if (imageBase64 != null) append(" [+IMG]")
                    if (audioUri != null) append(" [+AUDIO]")
                }
                Log.i(TAG, "Notification captured: $desc")
                if (alert?.flagged == true) {
                    Log.w(TAG, "⚠ ALERT: ${alert.flagReason} (severity=$severity) from $platform")
                }
            } else {
                Log.w(TAG, "Failed to send notification from $pkg")
            }
        }
    }

    /**
     * Extrai todo o texto possível da notificação:
     *  - android.title (cabeçalho — geralmente o nome do contacto ou grupo)
     *  - android.text (mensagem principal)
     *  - android.bigText (texto expandido — mensagens longas)
     *  - android.subText
     *  - MessagingStyle: lista de mensagens da conversa (cada uma com remetente + texto)
     *  - historicMessages: mensagens anteriores da mesma conversa
     *
     * O resultado é uma concatenação de todo o texto visível na notificação, incluindo
     * o histórico de mensagens do grupo/conversa — útil para o pai ver o contexto.
     */
    private fun extractNotificationText(notification: Notification): Pair<String, String> {
        val extras = notification.extras ?: return Pair("", "")

        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim()
            ?: extras.getCharSequence("android.title")?.toString()?.trim()
            ?: ""

        val parts = mutableListOf<String>()

        // Texto principal
        extras.getCharSequence("android.text")?.toString()?.trim()?.let { if (it.isNotEmpty()) parts.add(it) }
        // Big text (texto expandido)
        extras.getCharSequence("android.bigText")?.toString()?.trim()?.let { if (it.isNotEmpty()) parts.add(it) }
        // Sub text
        extras.getCharSequence("android.subText")?.toString()?.trim()?.let { if (it.isNotEmpty()) parts.add(it) }
        // Info text
        extras.getCharSequence("android.infoText")?.toString()?.trim()?.let { if (it.isNotEmpty()) parts.add(it) }
        // Summary text
        extras.getCharSequence("android.summaryText")?.toString()?.trim()?.let { if (it.isNotEmpty()) parts.add(it) }

        // MessagingStyle: lista de mensagens da conversa (Android 6+)
        // Isto é o que o WhatsApp usa para mostrar as últimas N mensagens da conversa
        // na notificação expandida. Cada mensagem tem: remetente + texto.
        val messages = extractMessagingStyleMessages(extras)
        if (messages.isNotEmpty()) {
            parts.add(messages)
        }

        val text = parts.joinToString("\n").trim()
        return Pair(title, text)
    }

    /**
     * Extrai mensagens de uma notificação MessagingStyle.
     * O WhatsApp/Messenger/Telegram usam este estilo para mostrar as últimas mensagens
     * da conversa. Cada mensagem tem: remetente + texto.
     *
     * Retorna uma string formatada como:
     *   "João: oi tudo bem?\nMaria: vou bem e tu?"
     */
    private fun extractMessagingStyleMessages(extras: Bundle): String {
        val result = StringBuilder()
        try {
            // EXTRA_MESSAGES: array de Parcelable (Notification.MessagingStyle.Message)
            val messages = extras.getParcelableArray("android.messages")
            messages?.forEach { msg ->
                try {
                    val msgBundle = getMessageFields(msg) ?: return@forEach
                    val sender = msgBundle["sender"] as? String ?: ""
                    val text = msgBundle["text"] as? String ?: ""
                    if (text.isNotEmpty()) {
                        result.append(if (sender.isNotEmpty()) "$sender: $text" else text)
                        result.append("\n")
                    }
                } catch (_: Exception) {}
            }

            // historicMessages: mensagens anteriores da conversa (Android 7+)
            val historic = extras.getParcelableArray("android.historicMessages")
            historic?.forEach { msg ->
                try {
                    val msgBundle = getMessageFields(msg) ?: return@forEach
                    val text = msgBundle["text"] as? String ?: ""
                    if (text.isNotEmpty()) {
                        result.append(text).append("\n")
                    }
                } catch (_: Exception) {}
            }
        } catch (e: Exception) {
            Log.d(TAG, "Could not extract MessagingStyle: ${e.message}")
        }
        return result.toString().trim()
    }

    /**
     * Reflexão para extrair campos de Notification.MessagingStyle.Message
     * (não expostos via Bundle em todos os Android).
     */
    private fun getMessageFields(msg: Any): Map<String, Any?>? {
        return try {
            val cls = msg.javaClass
            val text = cls.getMethod("getText").invoke(msg) as? CharSequence
            val sender = try {
                cls.getMethod("getSenderPerson")?.invoke(msg)?.let { person ->
                    person.javaClass.getMethod("getName").invoke(person) as? CharSequence
                }
            } catch (_: Exception) { null }
            mapOf(
                "text" to (text?.toString() ?: ""),
                "sender" to (sender?.toString() ?: "")
            )
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Extrai imagem da notificação — pode ser:
     *  - Notification.EXTRA_PICTURE (imagem partilhada — Android 6+)
     *  - Notification.largeIcon (ícone grande, geralmente a foto do contacto)
     *  - Notification.getLargeIcon() (Bitmap)
     *
     * Para o WhatsApp: quando o filho recebe uma foto, a notificação mostra uma
     * pré-visualização (thumbnail) — nós capturamos esse thumbnail.
     */
    private fun extractImage(notification: Notification): String? {
        try {
            // EXTRA_PICTURE — a imagem partilhada na notificação (estilo bigPicture)
            val pictureUri = notification.extras?.getParcelable<android.net.Uri>(Notification.EXTRA_PICTURE)
            if (pictureUri != null) {
                val bmp = loadBitmapFromUri(pictureUri, THUMBNAIL_MAX_DIM)
                if (bmp != null) return bitmapToBase64Jpeg(bmp)
            }

            // EXTRA_BIG_PICTURE — outra chave usada por algumas apps
            val bigPicture = notification.extras?.getParcelable<Uri>("android.bigPicture")
            if (bigPicture != null) {
                val bmp = loadBitmapFromUri(bigPicture, THUMBNAIL_MAX_DIM)
                if (bmp != null) return bitmapToBase64Jpeg(bmp)
            }

            // Notification.largeIcon — geralmente a foto do contacto (WhatsApp)
            val largeIcon = notification.getLargeIcon()
            if (largeIcon != null) {
                val bmp = largeIconToBitmap(largeIcon, THUMBNAIL_MAX_DIM)
                if (bmp != null) return bitmapToBase64Jpeg(bmp)
            }
        } catch (e: Exception) {
            Log.d(TAG, "Could not extract image: ${e.message}")
        }
        return null
    }

    /**
     * Extrai URI de áudio da notificação — o WhatsApp coloca o URI do voice note
     * em EXTRA_AUDIO_CONTENT_URI (Android 8+) quando chega um áudio.
     */
    private fun extractAudioUri(notification: Notification): String? {
        try {
            // EXTRA_AUDIO_CONTENT_URI só existe em Android 8+ (API 26).
            // Não é exposta como constante pública em todos os SDK levels, por isso
            // usamos a string literal "android.audioContentUri".
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                @Suppress("DEPRECATION")
                val audioUri = notification.extras?.getParcelable<Uri>("android.audioContentUri")
                if (audioUri != null) return audioUri.toString()
            }
            // Algumas apps usam a chave genérica
            @Suppress("DEPRECATION")
            val altAudio = notification.extras?.getParcelable<Uri>("android.audioUri")
            if (altAudio != null) return altAudio.toString()
        } catch (_: Exception) {}
        return null
    }

    private fun loadBitmapFromUri(uri: Uri, maxDim: Int): Bitmap? {
        return try {
            val input = contentResolver.openInputStream(uri) ?: return null
            input.use {
                // Primeiro decode bounds para dimensionar
                val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeStream(it, null, opts)
                // Recalcular sample size
                val sample = calculateSampleSize(opts.outWidth, opts.outHeight, maxDim)
                val realOpts = BitmapFactory.Options().apply { inSampleSize = sample }
                contentResolver.openInputStream(uri)?.use { s ->
                    BitmapFactory.decodeStream(s, null, realOpts)
                }
            }
        } catch (e: Exception) {
            Log.d(TAG, "Failed to load bitmap from $uri: ${e.message}")
            null
        }
    }

    private fun largeIconToBitmap(icon: android.graphics.drawable.Icon, maxDim: Int): Bitmap? {
        return try {
            val drawable = icon.loadDrawable(this) ?: return null
            val w = maxDim.coerceAtMost(256)
            val h = maxDim.coerceAtMost(256)
            val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            val canvas = android.graphics.Canvas(bitmap)
            drawable.setBounds(0, 0, canvas.width, canvas.height)
            drawable.draw(canvas)
            bitmap
        } catch (e: Exception) {
            Log.d(TAG, "Failed to convert largeIcon: ${e.message}")
            null
        }
    }

    private fun calculateSampleSize(w: Int, h: Int, maxDim: Int): Int {
        var sample = 1
        var max = maxOf(w, h)
        while (max / 2 >= maxDim) {
            max /= 2
            sample *= 2
        }
        return sample
    }

    private fun bitmapToBase64Jpeg(bmp: Bitmap): String? {
        return try {
            val out = ByteArrayOutputStream()
            var quality = 80
            bmp.compress(Bitmap.CompressFormat.JPEG, quality, out)
            var bytes = out.toByteArray()
            // Reduzir qualidade até caber em MAX_IMAGE_BASE64_BYTES
            while (bytes.size > MAX_IMAGE_BASE64_BYTES && quality > 20) {
                quality -= 10
                out.reset()
                bmp.compress(Bitmap.CompressFormat.JPEG, quality, out)
                bytes = out.toByteArray()
            }
            Base64.encodeToString(bytes, Base64.NO_WRAP)
        } catch (e: Exception) {
            Log.d(TAG, "Failed to encode bitmap: ${e.message}")
            null
        }
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
            "com.samsung.android.messaging" -> "sms"
            "com.android.mms" -> "sms"
            "org.telegram.messenger" -> "telegram"
            "com.discord" -> "discord"
            "com.skype.raider" -> "skype"
            "com.viber.voip" -> "viber"
            "com.tencent.mm" -> "wechat"
            "jp.naver.line.android" -> "line"
            "com.kakao.talk" -> "kakao"
            "com.truecaller" -> "truecaller"
            "com.google.android.gm" -> "gmail"
            else -> "other"
        }
    }
}
