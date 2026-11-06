package com.screenporter.companion.monitoring

import android.accessibilityservice.AccessibilityService
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.screenporter.companion.ScreenPorterApp
import com.screenporter.companion.network.ApiClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * AccessibilityService que captura MENSAGENS ENVIADAS (outgoing) em apps de mensagens.
 *
 * Porquê: o NotificationListenerService só captura mensagens RECEBIDAS — o Android não
 * gera notificação para o que o próprio utilizador escreve. As mensagens enviadas só são
 * visíveis lendo o ecrã da app (approach usado pelo mobile-tracker-free e similares,
 * que referem explicitamente "permite receber mensagens enviadas via acessibilidade").
 *
 * Estratégia:
 *  - Escuta eventos TYPE_WINDOW_CONTENT_CHANGED e TYPE_VIEW_TEXT_CHANGED nas apps de
 *    mensagens (mesma lista do NotificationListener).
 *  - Mantém o último texto digitado na EditText de input (campo com hint "Mensagem"/
 *    "Type a message"/"Message").
 *  - Quando a EditText é limpa (texto passa de não-vazio para vazio), assume-se que a
 *    mensagem foi enviada — captura o último texto e envia como notification outgoing.
 *
 * Privacidade:
 *  - Só lê o texto que o próprio utilizador está a digitar na app de mensagens (já visível
 *    no ecrã). Não há keylogger nem leitura de mensagens recebidas por esta via.
 *  - Consentimento explícito do pai/mãe é obrigatório.
 *  - Não grava chamadas nem áudio do microfone.
 */
class MessageCaptureAccessibilityService : AccessibilityService() {

    companion object {
        const val TAG = "SP-MsgCapture"

        // Último texto conhecido por pacote (para detetar "limpeza" = envio)
        @Volatile private var lastTypedText: String = ""
        @Volatile private var lastCaptureTs: Long = 0
        private const val DEDUP_WINDOW_MS = 1500L

        // Hint texts que identificam a caixa de input de mensagem nas várias apps
        private val MESSAGE_INPUT_HINTS = setOf(
            "mensagem", "message", "type a message", "text message",
            "digite uma mensagem", "escreva uma mensagem",
            "mesaj", "nachricht", "сообщение",
            "mensagem…", "message…", "type a message…"
        )
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val detector = AlertDetector()

    override fun onServiceConnected() {
        super.onServiceConnected()
        Log.i(TAG, "Message capture accessibility service connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val ev = event ?: return
        val pkg = ev.packageName?.toString() ?: return
        if (pkg !in NotificationListener.MESSENGER_PACKAGES) return

        val app = applicationContext as ScreenPorterApp
        if (!app.prefs.consentSigned) return

        // Só processar eventos de conteúdo de janela ou mudança de texto
        when (ev.eventType) {
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED,
            AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED -> {
                tryCaptureOutgoing(pkg)
            }
        }
    }

    /**
     * Percorre a árvore de nós da janela ativa à procura da EditText de input de
     * mensagem. Se o texto atual estiver vazio mas havia texto antes (lastTypedText),
     * assume-se envio e captura a mensagem.
     */
    private fun tryCaptureOutgoing(pkg: String) {
        val root = rootInActiveWindow ?: return
        try {
            val editText = findMessageInput(root) ?: return
            val currentText = editText.text?.toString()?.trim() ?: ""

            if (currentText.isEmpty() && lastTypedText.isNotEmpty()) {
                // A EditText foi limpa → mensagem enviada
                val sentText = lastTypedText
                val now = System.currentTimeMillis()
                // Dedup: não capturar a mesma mensagem repetidamente
                if (now - lastCaptureTs > DEDUP_WINDOW_MS) {
                    lastCaptureTs = now
                    sendOutgoingMessage(pkg, sentText, now)
                }
                lastTypedText = ""
            } else if (currentText.isNotEmpty()) {
                // Atualizar último texto digitado
                lastTypedText = currentText
            }
        } catch (e: Exception) {
            Log.d(TAG, "tryCapture error: ${e.message}")
        } finally {
            try { root.recycle() } catch (_: Exception) {}
        }
    }

    /**
     * Procura recursivamente na árvore de nós por uma EditText que pareça a caixa de
     * input de mensagem (pelo hint, contentDescription ou className).
     */
    private fun findMessageInput(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        // É uma EditText?
        val cls = node.className?.toString() ?: ""
        if (cls.contains("EditText")) {
            val hint = (node.text?.toString() ?: "") +
                " " + (node.contentDescription?.toString() ?: "") +
                " " + (node.hintText?.toString() ?: "")
            val hintLower = hint.lowercase()
            // Se tem hint de mensagem, é quase certamente a caixa de input
            if (MESSAGE_INPUT_HINTS.any { hintLower.contains(it) }) return node
            // Se tem texto não vazio e é a única EditText visível, também pode ser
        }
        // Recursão nos filhos
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val found = findMessageInput(child)
            if (found != null) return found
        }
        return null
    }

    /**
     * Envia a mensagem enviada como evento de notificação com direction="outgoing".
     * Aparece no dashboard na mesma conversa, mas numa bubble à direita (saída).
     */
    private fun sendOutgoingMessage(pkg: String, text: String, timestampMs: Long) {
        val platform = pkgToPlatform(pkg)
        val alert = detector.scan(text)
        val severity = when (alert?.flagReason) {
            "predator", "self_harm" -> "critical"
            "sexting", "cyberbullying" -> "high"
            "drugs" -> "medium"
            else -> "low"
        }

        val payload = mapOf(
            "platform" to platform,
            "packageName" to pkg,
            "title" to "(mensagem enviada)",
            "text" to text,
            "direction" to "outgoing",
            "flagged" to (alert?.flagged ?: false),
            "flagReason" to (alert?.flagReason ?: ""),
            "severity" to severity,
            "timestamp" to timestampMs
        )
        val event = mapOf("type" to "notification", "payload" to payload)

        scope.launch {
            val api = ApiClient(app.prefs)
            val ok = api.ingest(listOf(event))
            if (ok) {
                Log.i(TAG, "[$platform] OUTGOING capturado: ${text.take(50)}${if (text.length > 50) "…" else ""}")
                if (alert?.flagged == true) {
                    Log.w(TAG, "⚠ ALERT outgoing: ${alert.flagReason} (severity=$severity) from $platform")
                }
            } else {
                Log.w(TAG, "Failed to send outgoing message from $pkg")
            }
        }
    }

    override fun onInterrupt() {
        Log.w(TAG, "Message capture service interrupted")
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
