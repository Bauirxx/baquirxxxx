package com.screenporter.companion

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.screenporter.companion.util.PreferencesManager

/**
 * BootReceiver — auto-restart the CaptureService after the device boots,
 * if the user had previously toggled "Ligar" (connected).
 *
 * Receives:
 *  - BOOT_COMPLETED (regular unlock + boot, after user unlocks the device)
 *  - LOCKED_BOOT_COMPLETED (after boot but before unlock — Direct Boot)
 *  - MY_PACKAGE_REPLACED (after the app is updated)
 *
 * In LOCKED_BOOT_COMPLETED, the service starts in CONTROLO mode (no capture)
 * because no MediaProjection permission can be granted yet. Once the user unlocks
 * the device, if Accessibility is enabled, the service escalates to ECRÃ mode.
 *
 * Note: CaptureService will decide its own mode in onStartCommand.
 */
class BootReceiver : BroadcastReceiver() {

    companion object {
        const val TAG = "SP-Boot"
    }

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_LOCKED_BOOT_COMPLETED,
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED -> {
                startIfConnected(context, intent)
            }
        }
    }

    private fun startIfConnected(context: Context, intent: Intent) {
        val prefs = PreferencesManager(context)
        if (!prefs.isConnected) {
            Log.i(TAG, "User hadn't connected — not auto-starting")
            return
        }
        // If LOCKED_BOOT_COMPLETED and we're in Direct Boot (user hasn't unlocked),
        // we may need to use a Context unlocked for Direct Boot.
        val ctx = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N &&
            intent.action == Intent.ACTION_LOCKED_BOOT_COMPLETED) {
            context.createDeviceProtectedStorageContext()
        } else {
            context
        }
        Log.i(TAG, "Auto-starting CaptureService after ${intent.action}")
        val svcIntent = Intent(ctx, CaptureService::class.java).apply {
            action = CaptureService.ACTION_START
            // No EXTRA_RESULT_CODE/DATA — CaptureService will fall to ECRÃ or CONTROLO
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(svcIntent)
            } else {
                ctx.startService(svcIntent)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start CaptureService on boot", e)
        }
    }
}
