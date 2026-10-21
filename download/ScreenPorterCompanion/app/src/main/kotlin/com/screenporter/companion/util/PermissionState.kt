package com.screenporter.companion.util

import android.Manifest
import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Process
import android.provider.Settings
import android.text.TextUtils
import androidx.core.content.ContextCompat

object PermissionState {

    // ============================================================
    // Accessibility (gestos + screenshots)
    // ============================================================
    fun isAccessibilityEnabled(context: Context): Boolean {
        val expected = context.packageName + "/" +
            "com.screenporter.companion.ControlAccessibilityService"
        val enabled = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        val colonSplit = TextUtils.split(enabled, ":")
        for (s in colonSplit) {
            if (s.equals(expected, ignoreCase = true)) return true
            val componentSplit = TextUtils.split(s, "/")
            if (componentSplit.size > 0 && componentSplit[0].equals(context.packageName, ignoreCase = true)) return true
        }
        return false
    }

    // ============================================================
    // Battery
    // ============================================================
    fun isBatteryOptimizationIgnored(context: Context): Boolean {
        val pm = context.getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
        return pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    // ============================================================
    // Notifications (Android 13+)
    // ============================================================
    fun isNotificationGranted(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        return ContextCompat.checkSelfPermission(
            context, Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
    }

    // ============================================================
    // Location
    // ============================================================
    fun isLocationGranted(context: Context): Boolean {
        val fine = ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        return fine || coarse
    }

    // ============================================================
    // Call log
    // ============================================================
    fun isCallLogGranted(context: Context): Boolean {
        return ContextCompat.checkSelfPermission(
            context, Manifest.permission.READ_CALL_LOG
        ) == PackageManager.PERMISSION_GRANTED
    }

    // ============================================================
    // SMS
    // ============================================================
    fun isSmsGranted(context: Context): Boolean {
        return ContextCompat.checkSelfPermission(
            context, Manifest.permission.READ_SMS
        ) == PackageManager.PERMISSION_GRANTED
    }

    // ============================================================
    // Usage stats (special permission via Settings)
    // ============================================================
    fun isUsageStatsGranted(context: Context): Boolean {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            appOps.unsafeCheckOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                context.packageName
            )
        } else {
            @Suppress("DEPRECATION")
            appOps.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                context.packageName
            )
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }

    // ============================================================
    // Notification listener (special permission via Settings)
    // ============================================================
    fun isNotificationListenerEnabled(context: Context): Boolean {
        val flat = Settings.Secure.getString(
            context.contentResolver,
            "enabled_notification_listeners"
        ) ?: return false
        val colonSplit = TextUtils.split(flat, ":")
        for (s in colonSplit) {
            val componentSplit = TextUtils.split(s, "/")
            if (componentSplit.size > 0 && componentSplit[0].equals(context.packageName, ignoreCase = true)) return true
        }
        return false
    }

    // ============================================================
    // Overlay (SYSTEM_ALERT_WINDOW — for SOS button)
    // ============================================================
    fun canDrawOverlays(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            return Settings.canDrawOverlays(context)
        }
        return true // pre-M: no permission needed
    }

    // ============================================================
    // Camera (for QR scanner)
    // ============================================================
    fun isCameraGranted(context: Context): Boolean {
        return ContextCompat.checkSelfPermission(
            context, Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED
    }

    // ============================================================
    // Browser history
    // ============================================================
    fun isBrowserHistoryGranted(context: Context): Boolean {
        return ContextCompat.checkSelfPermission(
            context, "android.permission.READ_HISTORY_BOOKMARKS"
        ) == PackageManager.PERMISSION_GRANTED
    }

    // ============================================================
    // Intent shortcuts to grant special permissions
    // ============================================================
    fun accessibilitySettingsIntent(): Intent =
        Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    fun usageStatsSettingsIntent(): Intent =
        Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    fun notificationListenerSettingsIntent(): Intent =
        Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    fun overlaySettingsIntent(context: Context): Intent =
        Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            android.net.Uri.parse("package:${context.packageName}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
}
