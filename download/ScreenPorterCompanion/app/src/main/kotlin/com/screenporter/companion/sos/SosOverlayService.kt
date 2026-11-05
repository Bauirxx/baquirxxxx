package com.screenporter.companion.sos

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.Button
import androidx.core.app.NotificationCompat
import com.screenporter.companion.MainActivity
import com.screenporter.companion.R
import com.screenporter.companion.network.ApiClient
import com.screenporter.companion.util.PreferencesManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import com.screenporter.companion.ControlAccessibilityService

/**
 * SOS Overlay Service — draws a floating button on top of any app that the user
 * can press at any time to send a panic alert to the parent's dashboard.
 *
 * The SOS event includes:
 *  - Current GPS/network location (if permission granted)
 *  - Battery level (if accessible)
 *  - Timestamp
 *
 * Requires: SYSTEM_ALERT_WINDOW permission (Settings > Apps > ScreenPorter >
 * Display over other apps).
 *
 * Transparency: the floating button is visible to the user at all times. It only
 * appears when the user explicitly toggles "Show SOS button" in MainActivity.
 */
class SosOverlayService : Service() {

    companion object {
        const val TAG = "SP-SosOverlay"
        const val NOTIF_ID = 2002
        const val ACTION_SHOW = "com.screenporter.companion.SOS_SHOW"
        const val ACTION_HIDE = "com.screenporter.companion.SOS_HIDE"

        @Volatile
        var instance: SosOverlayService? = null
            private set
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var prefs: PreferencesManager
    private lateinit var api: ApiClient
    private var windowManager: WindowManager? = null
    private var overlayView: View? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        prefs = (application as com.screenporter.companion.ScreenPorterApp).prefs
        api = ApiClient(prefs)
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_HIDE -> {
                hideOverlay()
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_SHOW, null -> {
                startForeground(NOTIF_ID, buildNotification())
                if (com.screenporter.companion.util.PermissionState.canDrawOverlays(this)) {
                    showOverlay()
                } else {
                    Log.w(TAG, "SYSTEM_ALERT_WINDOW not granted — cannot show overlay")
                }
            }
        }
        return START_STICKY
    }

    private fun showOverlay() {
        if (overlayView != null) return

        val layoutParams = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.BOTTOM or Gravity.END
            x = 32
            y = 200
        }

        val button = Button(this).apply {
            text = "SOS"
            setBackgroundColor(0xFFEF4444.toInt())
            setTextColor(0xFFFFFFFF.toInt())
            setPadding(32, 16, 32, 16)
            setOnTouchListener { v, event ->
                if (event.action == MotionEvent.ACTION_UP) {
                    sendSos()
                    v.performClick()
                }
                true
            }
        }
        overlayView = button
        try {
            windowManager?.addView(button, layoutParams)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to add overlay view", e)
        }
    }

    private fun hideOverlay() {
        overlayView?.let { windowManager?.removeView(it) }
        overlayView = null
    }

    /**
     * Send an SOS event to the server with current location + battery.
     */
    private fun sendSos() {
        scope.launch {
            val loc = getLastKnownLocation()
            val battery = getBatteryLevel()
            val event = mapOf(
                "type" to "sos",
                "payload" to mapOf(
                    "latitude" to loc?.latitude,
                    "longitude" to loc?.longitude,
                    "accuracy" to (if (loc?.hasAccuracy() == true) loc.accuracy.toDouble() else null),
                    "battery" to battery,
                    "trigger" to "button",
                    "timestamp" to System.currentTimeMillis()
                )
            )
            val ok = api.ingest(listOf(event))
            if (ok) Log.i(TAG, "SOS sent")
            else Log.w(TAG, "Failed to send SOS")
        }
    }

    @android.annotation.SuppressLint("MissingPermission")
    private fun getLastKnownLocation(): Location? {
        if (!com.screenporter.companion.util.PermissionState.isLocationGranted(this)) return null
        return try {
            val lm = getSystemService(Context.LOCATION_SERVICE) as LocationManager
            val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
            for (p in providers) {
                if (lm.isProviderEnabled(p)) {
                    val loc = lm.getLastKnownLocation(p)
                    if (loc != null) return loc
                }
            }
            null
        } catch (e: SecurityException) { null }
    }

    private fun getBatteryLevel(): Int {
        return try {
            val intent = registerReceiver(null, android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            val level = intent?.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = intent?.getIntExtra(android.os.BatteryManager.EXTRA_SCALE, -1) ?: -1
            if (level == -1 || scale == -1) 100 else (level * 100) / scale
        } catch (e: Exception) { 100 }
    }

    private fun buildNotification(): Notification {
        ControlAccessibilityService.ensureChannel(this)
        val pi = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).apply { flags = Intent.FLAG_ACTIVITY_SINGLE_TOP },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return NotificationCompat.Builder(this, ControlAccessibilityService.CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("ScreenPorter SOS ativo")
            .setContentText("Botão de pânico disponível")
            .setOngoing(true)
            .setContentIntent(pi)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    override fun onDestroy() {
        hideOverlay()
        instance = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
