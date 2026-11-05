package com.screenporter.companion

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * DeviceAdminReceiver used for the OPTIONAL Device Owner mode
 * (set via `adb shell dpm set-device-owner com.screenporter.companion/.AdminReceiver`).
 *
 * This is an OPEN / DISCLOSED capability for fleet/kiosk scenarios or
 * consented supervision of owned devices. The device shows clearly
 * that it is "managed" and the app remains visible (icon + notification).
 *
 * What it enables:
 *  - setUninstallBlocked() — prevent the user from uninstalling the companion
 *  - setLockTaskPackages() — kiosk mode (not used in default build)
 *
 * What it does NOT do:
 *  - Hide the app icon
 *  - Block user from removing it via dpm remove-active-device-admin
 *  - Keylogging, call recording, message interception
 */
class AdminReceiver : DeviceAdminReceiver() {

    companion object {
        const val TAG = "SP-Admin"
    }

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Log.i(TAG, "Device admin enabled")
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        Log.w(TAG, "Device admin disabled")
    }

    override fun onLockTaskModeEntering(context: Context, intent: Intent, pkg: String) {
        Log.i(TAG, "Lock task mode entering: $pkg")
    }

    override fun onLockTaskModeExiting(context: Context, intent: Intent) {
        Log.i(TAG, "Lock task mode exiting")
    }
}
