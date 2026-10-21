package com.screenporter.companion

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.accessibilityservice.GestureDescription.StrokeDescription
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Path
import android.os.Build
import android.util.Log
import android.view.Display
import android.view.accessibility.AccessibilityEvent
import androidx.core.app.NotificationCompat
import android.app.NotificationChannel
import android.app.NotificationManager
import com.screenporter.companion.network.WsMessage
import kotlin.math.roundToInt

/**
 * AccessibilityService that handles remote control commands:
 *  - dispatchGesture for touch/drag (Android 7.0+)
 *  - takeScreenshot (Android 11+) — feeds the ECRÃ capture mode
 *  - global action buttons: Voltar (BACK), Início (HOME), Recentes (RECENTS)
 *
 * Also self-restarts after device reboot — the OS re-enables accessibility services
 * automatically if enabled by the user.
 *
 * Transparency: always visible in Settings > Accessibility, with a clear description.
 * No keylogging, no call recording, no message interception.
 */
class ControlAccessibilityService : AccessibilityService() {

    companion object {
        @Volatile
        var instance: ControlAccessibilityService? = null
            private set

        const val CHANNEL_ID = "sp_capture"
        const val NOTIF_ID = 1001
        const val TAG = "SP-Accessibility"

        fun ensureChannel(context: Context) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                    val ch = NotificationChannel(
                        CHANNEL_ID,
                        context.getString(R.string.notification_channel_name),
                        NotificationManager.IMPORTANCE_LOW
                    ).apply {
                        description = context.getString(R.string.notification_channel_desc)
                        setShowBadge(false)
                    }
                    nm.createNotificationChannel(ch)
                }
            }
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        Log.i(TAG, "Accessibility service connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // We don't care about accessibility events — only need the service enabled
        // for dispatchGesture + takeScreenshot.
    }

    override fun onInterrupt() {
        Log.w(TAG, "Accessibility service interrupted")
    }

    override fun onUnbind(intent: Intent?): Boolean {
        instance = null
        return false
    }

    /**
     * Dispatch a tap at relative coordinates (0..1) on the screen.
     */
    fun tapAt(relX: Float, relY: Float, durationMs: Long = 50) {
        val w = resources.displayMetrics.widthPixels
        val h = resources.displayMetrics.heightPixels
        val x = (relX * w).roundToInt().toFloat()
        val y = (relY * h).roundToInt().toFloat()
        val path = Path().apply { moveTo(x, y) }
        val stroke = StrokeDescription(path, 0L, durationMs)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        val ok = dispatchGesture(gesture, object : GestureResultCallback() {
            override fun onCompleted(g: GestureDescription?) {}
            override fun onCancelled(g: GestureDescription?) {}
        }, null)
        Log.d(TAG, "tapAt($x,$y,dur=$durationMs) ok=$ok")
    }

    /**
     * Dispatch a swipe (drag) between two relative points.
     */
    fun swipe(startX: Float, startY: Float, endX: Float, endY: Float, durationMs: Long = 300) {
        val w = resources.displayMetrics.widthPixels
        val h = resources.displayMetrics.heightPixels
        val path = Path().apply {
            moveTo(startX * w, startY * h)
            lineTo(endX * w, endY * h)
        }
        val stroke = StrokeDescription(path, 0L, durationMs)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        dispatchGesture(gesture, null, null)
    }

    /**
     * Take a screenshot of the entire screen (Android 11+).
     */
    fun takeScreenshot(callback: (Bitmap?) -> Unit) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            callback(null)
            return
        }
        takeScreenshot(Display.DEFAULT_DISPLAY, mainExecutor,
            object : TakeScreenshotCallback {
                override fun onSuccess(screenshot: ScreenshotResult) {
                    val bitmap = Bitmap.wrapHardwareBuffer(
                        screenshot.hardwareBuffer,
                        screenshot.colorSpace
                    )
                    callback(bitmap)
                    screenshot.hardwareBuffer.close()
                }
                override fun onFailure(errorCode: Int) {
                    Log.w(TAG, "takeScreenshot failed: $errorCode")
                    callback(null)
                }
            }
        )
    }

    /**
     * Handle a control command received via WebSocket.
     */
    fun handleControl(cmd: WsMessage.Control) {
        when (cmd.command) {
            "touch" -> {
                if (cmd.x != null && cmd.y != null) {
                    tapAt(cmd.x, cmd.y, cmd.duration ?: 50)
                }
            }
            "swipe" -> {
                // Expects custom payload fields startX, startY, endX, endY
                // (forward compatibility — for now degrade to tap)
                if (cmd.x != null && cmd.y != null) {
                    tapAt(cmd.x, cmd.y, cmd.duration ?: 50)
                }
            }
            "back" -> performGlobalAction(GLOBAL_ACTION_BACK)
            "home" -> performGlobalAction(GLOBAL_ACTION_HOME)
            "recents" -> performGlobalAction(GLOBAL_ACTION_RECENTS)
            "power" -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    performGlobalAction(GLOBAL_ACTION_POWER_DIALOG)
                }
            }
            "volume_up", "volume_down" -> {
                // Volume changes aren't available via Accessibility; ADB-based devices
                // handle this server-side. Companion shows a toast instead.
            }
            "open_app" -> {
                cmd.text?.let { packageName ->
                    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
                    if (launchIntent != null) {
                        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        startActivity(launchIntent)
                    }
                }
            }
            "reboot" -> {
                // Requires Device Owner/Admin; AdminReceiver handles this.
            }
            else -> Log.w(TAG, "Unknown command: ${cmd.command}")
        }
    }
}
