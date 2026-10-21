package com.screenporter.companion.network

import android.util.Log
import com.screenporter.companion.util.PreferencesManager
import okhttp3.*
import okio.ByteString
import java.util.concurrent.TimeUnit

/**
 * OkHttp WebSocket client for real-time communication with the ScreenPorter server.
 * - Auto-reconnect with exponential backoff
 * - Sends `hello` on connect (registers device)
 * - Heartbeat every 30s
 * - Receives control commands (touch/key/text/back/...) and forwards them to the
 *   ControlAccessibilityService via a callback.
 *
 * Sends binary H.264 video frames with a 12-byte header:
 *   byte[0]    flags (bit 0 = keyframe, bit 1 = config)
 *   byte[1..8] timestamp (long, big-endian, microseconds)
 *   byte[9..11] reserved (zeros)
 *   then the raw Annex-B payload.
 */
class WebSocketClient(private val prefs: PreferencesManager) {

    interface Listener {
        fun onConnect()
        fun onDisconnect(reason: String)
        fun onControl(message: WsMessage.Control)
        fun onText(message: String)
    }

    var listener: Listener? = null

    private val client: OkHttpClient = OkHttpClient.Builder()
        .pingInterval(25, TimeUnit.SECONDS)
        .build()

    private var ws: WebSocket? = null
    private var shouldRun = false
    private var reconnectAttempts = 0

    fun start() {
        shouldRun = true
        connect()
    }

    fun stop() {
        shouldRun = false
        ws?.close(1000, "stopped")
        ws = null
    }

    private fun connect() {
        val addr = prefs.serverAddress.trimEnd('/')
        if (addr.isEmpty()) {
            Log.w(TAG, "server address empty")
            return
        }
        val token = prefs.authToken
        if (token.isNullOrEmpty()) {
            Log.w(TAG, "no auth token; login first")
            return
        }

        val urlStr = if (addr.startsWith("http://")) "ws://" + addr.removePrefix("http://")
                     else if (addr.startsWith("https://")) "wss://" + addr.removePrefix("https://")
                     else "ws://$addr"

        val req = Request.Builder()
            .url(urlStr)
            .header("X-Agent-Token", token)
            .build()

        Log.i(TAG, "Connecting to $urlStr")
        ws = client.newWebSocket(req, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.i(TAG, "WebSocket open")
                reconnectAttempts = 0
                sendHello()
                listener?.onConnect()
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handleTextMessage(text)
            }

            override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                // Server may send binary control frames in future; ignore for now
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(code, reason)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.w(TAG, "WebSocket closed: $code $reason")
                listener?.onDisconnect(reason)
                if (shouldRun) scheduleReconnect()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e(TAG, "WebSocket failure", t)
                listener?.onDisconnect(t.message ?: "unknown")
                if (shouldRun) scheduleReconnect()
            }
        })
    }

    private fun scheduleReconnect() {
        reconnectAttempts++
        val delayMs = (1500L * reconnectAttempts).coerceAtMost(15000L)
        Thread {
            try {
                Thread.sleep(delayMs)
                if (shouldRun) connect()
            } catch (e: InterruptedException) {
                // stop
            }
        }.apply { isDaemon = true; name = "sp-ws-reconnect" }.start()
    }

    private fun sendHello() {
        val model = android.os.Build.MODEL
        // Use cached screen size from companion object
        val w = WebSocketClient.screenWidth
        val h = WebSocketClient.screenHeight
        val hello = """{"t":"hello","id":"${prefs.deviceId}","model":"$model","width":$w,"height":$h,"osVersion":"Android ${android.os.Build.VERSION.RELEASE}","agentVersion":"0.1.0"}"""
        ws?.send(hello)
    }

    fun sendText(json: String) {
        ws?.send(json)
    }

    /**
     * Send a binary H.264 frame with the 12-byte header (see class doc).
     */
    fun sendBinaryFrame(payload: ByteArray, isKeyframe: Boolean, isConfig: Boolean, timestampUs: Long) {
        val frame = ByteArray(12 + payload.size)
        var flags = 0
        if (isKeyframe) flags = flags or 0x01
        if (isConfig) flags = flags or 0x02
        frame[0] = flags.toByte()
        // timestamp big-endian
        for (i in 0 until 8) {
            frame[1 + i] = (timestampUs ushr (56 - i * 8)).toByte()
        }
        frame[9] = 0
        frame[10] = 0
        frame[11] = 0
        System.arraycopy(payload, 0, frame, 12, payload.size)
        ws?.send(ByteString.of(*frame))
    }

    private fun handleTextMessage(text: String) {
        // Parse minimal JSON (avoid extra dependencies).
        // Expected: {"command":"touch","x":0.5,"y":0.5,"duration":0} etc.
        try {
            val json = org.json.JSONObject(text)
            val cmd = json.optString("command", "")
            if (cmd.isNotEmpty()) {
                val c = WsMessage.Control(
                    command = cmd,
                    x = if (json.has("x")) json.getDouble("x").toFloat() else null,
                    y = if (json.has("y")) json.getDouble("y").toFloat() else null,
                    duration = if (json.has("duration")) json.getLong("duration") else null,
                    text = if (json.has("text")) json.getString("text") else null,
                    key = if (json.has("key")) json.getInt("key") else null
                )
                listener?.onControl(c)
                return
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to parse text message: $text", e)
        }
        listener?.onText(text)
    }

    companion object {
        const val TAG = "SP-WebSocket"

        // Cached screen size, set by CaptureService on startup.
        @Volatile
        var screenWidth: Int = 1080

        @Volatile
        var screenHeight: Int = 2400
    }
}
