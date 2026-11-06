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
 * NotificationListenerService — captura notificações de apps de mensagens
 * (WhatsApp, Instagram, TikTok, Snapchat, Messenger, Telegram, Discord, etc.)
 *
 * Captura MENSAGENS RECEBIDAS (incoming). As enviadas não geram notificação —
 * são capturadas pelo ControlAccessibilityService que lê o ecrã da app.
 *
 * Para cada notificação extrai:
 *  - Texto da mensagem (android.text, android.bigText, android.subText)
 *  - Histórico de mensagens da conversa (MessagingStyle.messages + historicMessages)
 *  - Anexos multimédia (imagem/vídeo/áudio) de Message.getDataUri()
 *
 * MULTIMÉDIA → GALERIA:
 *  Os anexos de imagem/vídeo/áudio são enviados como MediaEvent (upload multipart
 *  para /api/agent/upload) pelo NotificationMediaUploader — aparecem na Galeria de
 *  Mídia do dashboard. Uma thumbnail pequena vai embutida no evento de notificação
 *  para preview imediato. O servidor faz dedup, pelo que se o MediaReporter também
 *  capturar o mesmo ficheiro da galeria não há duplicado.
 *
 * Isto NÃO é bypass de cifragem E2E — é o conteúdo que aparece na notificação,
 * visível para o utilizador do dispositivo.
 *
 * Cada notificação é enviada para o servidor com:
 *  - platform (whatsapp, instagram, etc.)
 *  - packageName (com.whatsapp, etc.)
 *  - title (geralmente o nome do contacto)
 *  - text (conteúdo textual completo, incluindo histórico da conversa)
 *  - direction ("incoming")
 *  - hasImage + imageBase64 (thumbnail JPEG, se houver)
 *  - hasAudio + audioUri (se houver nota de voz)
 *  - flagged + flagReason + severity (se o AlertDetector detetar risco)
 */
class NotificationListener : NotificationListenerService() {

    companion object {
        const val TAG = "SP-NotifListener"
        // Deduplication: last notification key + timestamp to avoid sending duplicates
        @Volatile private var lastNotifKey = ""
        @Volatile private var lastNotifTs = 0L
        private const val DEDUP_WINDOW_MS = 3000L

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

        private const val MAX_IMAGE_BASE64_BYTES = 50_000
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

        // Ignorar notificações de resumo de grupo (FLAG_GROUP_SUMMARY) — geram ruído
        // e duplicam conteúdo das notificações individuais dos membros do grupo.
        if (notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) {
            Log.d(TAG, "Group summary notification from $pkg — skip")
            return
        }

        // Extrair todo o conteúdo possível da notificação
        val (title, text) = extractNotificationText(notification)
        val attachments = extractMediaAttachments(notification)

        // Se não há texto nem anexos, não vale a pena enviar
        if (text.isBlank() && attachments.isEmpty()) {
            Log.d(TAG, "Empty notification from $pkg — skip")
            return
        }

        // Deduplication: skip if same key sent within DEDUP_WINDOW_MS
        val dedupKey = "$pkg|$title|$text"
        val now = System.currentTimeMillis()
        if (dedupKey == lastNotifKey && now - lastNotifTs < DEDUP_WINDOW_MS) {
            Log.d(TAG, "Duplicate notification from $pkg — skip (${now - lastNotifTs}ms)")
            return
        }
        lastNotifKey = dedupKey
        lastNotifTs = now

        // Detetar risco no texto (se houver texto)
        val alert = if (text.isNotBlank()) detector.scan(text) else null
        val severity = when (alert?.flagReason) {
            "predator", "self_harm" -> "critical"
            "sexting", "cyberbullying" -> "high"
            "drugs" -> "medium"
            else -> "low"
        }

        val platform = pkgToPlatform(pkg)

        // Upload de anexos multimédia para a GALERIA (MediaEvent) + extrair thumbnail
        var firstImageThumb: String? = null
        var hasImage = false
        var hasAudio = false
        var audioUriStr: String? = null
        for (att in attachments) {
            val uploaded = NotificationMediaUploader.upload(
                context = this,
                prefs = app.prefs,
                uri = att.uri,
                mimeType = att.mimeType,
                type = att.type,            // photo | video | audio
                source = platform,          // whatsapp, instagram, ...
                timestampMs = now
            )
            if (uploaded) Log.i(TAG, "[$platform] anexo ${att.type} enviado para galeria")
            else Log.w(TAG, "[$platform] falhou upload do anexo ${att.type}")

            // Thumbnail inline só para fotos (preview rápido na notificação)
            if (att.type == "photo" && firstImageThumb == null) {
                firstImageThumb = NotificationMediaUploader.thumbnailBase64(this, att.uri)
                hasImage = true
            }
            if (att.type == "audio") {
                hasAudio = true
                if (audioUriStr == null) audioUriStr = att.uri.toString()
            }
            if (att.type == "video") hasImage = true // marca que há media visual
        }

        // Fallback: EXTRA_PICTURE (Bitmap) se MessagingStyle não trouxer dataUri
        if (firstImageThumb == null) {
            val picThumb = extractPictureBitmapBase64(notification)
            if (picThumb != null) { firstImageThumb = picThumb; hasImage = true }
        }

        val payload = mutableMapOf<String, Any>(
            "platform" to platform,
            "packageName" to pkg,
            "title" to title,
            "text" to text,
            "direction" to "incoming",
            "flagged" to (alert?.flagged ?: false),
            "flagReason" to (alert?.flagReason ?: ""),
            "severity" to severity,
            "timestamp" to now
        )
        if (hasImage && firstImageThumb != null) {
            payload["hasImage"] = true
            payload["imageBase64"] = firstImageThumb
        }
        if (hasAudio) {
            payload["hasAudio"] = true
            if (audioUriStr != null) payload["audioUri"] = audioUriStr
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
                    if (hasImage) append(" [+IMG]")
                    if (hasAudio) append(" [+AUDIO]")
                    if (attachments.any { it.type == "video" }) append(" [+VIDEO]")
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

    /** Representa um anexo multimédia extraído de uma Message do MessagingStyle. */
    private data class MediaAttachment(
        val uri: Uri,
        val mimeType: String,
        val type: String // photo | video | audio
    )

    /**
     * Extrai TODOS os anexos multimédia das mensagens do MessagingStyle.
     * Percorre android.messages e recolhe cada Message.getDataUri() com o respetivo
     * mimeType (image/*, video/*, audio/*). Ao contrário da versão anterior, devolve
     * a lista completa — não só o primeiro.
     */
    private fun extractMediaAttachments(notification: Notification): List<MediaAttachment> {
        val result = mutableListOf<MediaAttachment>()
        val extras = notification.extras ?: return result
        try {
            val messages = extras.getParcelableArray("android.messages") ?: return result
            for (msg in messages) {
                val msgObj = msg ?: continue
                try {
                    val dataUri = msgObj.javaClass.getMethod("getDataUri").invoke(msgObj) as? Uri
                    val dataMime = msgObj.javaClass.getMethod("getDataMimeType").invoke(msgObj) as? String
                    if (dataUri != null && dataMime != null) {
                        val type = when {
                            dataMime.startsWith("image/") -> "photo"
                            dataMime.startsWith("video/") -> "video"
                            dataMime.startsWith("audio/") -> "audio"
                            else -> null
                        }
                        if (type != null) result.add(MediaAttachment(dataUri, dataMime, type))
                    }
                } catch (_: Exception) {}
            }
        } catch (_: Exception) {}
        return result
    }

    /**
     * Fallback: extrai thumbnail de EXTRA_PICTURE / android.bigPicture (Bitmap) — usado
     * quando a app não usa MessagingStyle com dataUri (ex: BigPictureStyle).
     * Devolve base64 JPEG pequeno para preview inline.
     */
    private fun extractPictureBitmapBase64(notification: Notification): String? {
        val extras = notification.extras ?: return null
        try {
            val picture = extras.get(Notification.EXTRA_PICTURE)
            val bmp = when (picture) {
                is Bitmap -> scaleBitmap(picture, THUMBNAIL_MAX_DIM)
                is Uri -> loadBitmapFromUri(picture, THUMBNAIL_MAX_DIM)
                else -> null
            }
            if (bmp != null) return bitmapToBase64Jpeg(bmp)

            val bigPicture = extras.get("android.bigPicture")
            val bmp2 = when (bigPicture) {
                is Bitmap -> scaleBitmap(bigPicture, THUMBNAIL_MAX_DIM)
                is Uri -> loadBitmapFromUri(bigPicture, THUMBNAIL_MAX_DIM)
                else -> null
            }
            if (bmp2 != null) return bitmapToBase64Jpeg(bmp2)
        } catch (e: Exception) {
            Log.d(TAG, "Could not extract picture: ${e.message}")
        }
        return null
    }

    /**
     * Extrai todo o texto possível da notificação:
     *  - android.title (cabeçalho — geralmente o nome do contacto ou grupo)
     *  - android.text (mensagem principal)
     *  - android.bigText (texto expandido — mensagens longas)
     *  - android.subText
     *  - MessagingStyle: lista de mensagens da conversa (cada uma com remetente + texto)
     *  - historicMessages: mensagens anteriores da mesma conversa
     */
    private fun extractNotificationText(notification: Notification): Pair<String, String> {
        val extras = notification.extras ?: return Pair("", "")

        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim()
            ?: extras.getCharSequence("android.title")?.toString()?.trim()
            ?: ""

        val parts = mutableListOf<String>()
        extras.getCharSequence("android.text")?.toString()?.trim()?.let { if (it.isNotEmpty()) parts.add(it) }
        extras.getCharSequence("android.bigText")?.toString()?.trim()?.let { if (it.isNotEmpty()) parts.add(it) }
        extras.getCharSequence("android.subText")?.toString()?.trim()?.let { if (it.isNotEmpty()) parts.add(it) }
        extras.getCharSequence("android.infoText")?.toString()?.trim()?.let { if (it.isNotEmpty()) parts.add(it) }
        extras.getCharSequence("android.summaryText")?.toString()?.trim()?.let { if (it.isNotEmpty()) parts.add(it) }

        val messages = extractMessagingStyleMessages(extras)
        if (messages.isNotEmpty()) parts.add(messages)

        val text = parts.joinToString("\n").trim()
        return Pair(title, text)
    }

    /**
     * Extrai mensagens de uma notificação MessagingStyle.
     * Retorna uma string formatada como:
     *   "João: oi tudo bem?\nMaria: vou bem e tu?"
     */
    private fun extractMessagingStyleMessages(extras: Bundle): String {
        val result = StringBuilder()
        try {
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

    /** Reflexão para extrair campos de Notification.MessagingStyle.Message. */
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

    private fun scaleBitmap(bmp: Bitmap, maxDim: Int): Bitmap {
        val w = bmp.width
        val h = bmp.height
        if (w <= maxDim && h <= maxDim) return bmp
        val scale = maxDim.toFloat() / maxOf(w, h)
        return Bitmap.createScaledBitmap(bmp, (w * scale).toInt(), (h * scale).toInt(), true)
    }

    private fun loadBitmapFromUri(uri: Uri, maxDim: Int): Bitmap? {
        return try {
            val input = contentResolver.openInputStream(uri) ?: return null
            input.use {
                val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeStream(it, null, opts)
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
