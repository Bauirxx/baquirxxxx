package com.screenporter.companion.location

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.content.ContextCompat
import com.screenporter.companion.network.ApiClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import com.screenporter.companion.util.PreferencesManager

/**
 * Reports location updates to the server via /api/agent/ingest.
 * Uses LocationManager (GPS + NETWORK) for compatibility without Play Services.
 *
 * IMPORTANT: getLastKnownLocation() frequently returns null on devices where no
 * other app has recently requested a fix. So we ACTIVELY request a fresh fix:
 *  - Android R+ (30+): LocationManager.getCurrentLocation() (single fresh fix)
 *  - older: requestLocationUpdates() on the main Looper, removed after first fix
 * We still send the last known location immediately as a best-effort head start.
 *
 * Polls every ~30 seconds; only sends if moved >25 m or >30 s elapsed.
 *
 * Transparency: the foreground notification indicates when location is being shared.
 */
class LocationReporter(
    private val context: Context,
    private val prefs: PreferencesManager,
    private val apiClient: ApiClient
) {
    private val scope = CoroutineScope(Dispatchers.IO + Job())
    private var reportingJob: Job? = null
    private var lastSent: Location? = null

    fun start() {
        if (!hasPermission()) {
            Log.w(TAG, "Location permission not granted — not starting")
            return
        }
        // Best-effort: envia a última posição conhecida imediatamente (se existir).
        sendLastKnown()
        // E força já um fix novo para não depender do cache.
        requestFreshFix()
        reportingJob?.cancel()
        reportingJob = scope.launch {
            while (true) {
                delay(30_000)
                requestFreshFix()
            }
        }
    }

    fun stop() {
        reportingJob?.cancel()
        reportingJob = null
    }

    @SuppressLint("MissingPermission")
    private fun sendLastKnown() {
        if (!hasPermission()) return
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        for (p in listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)) {
            if (!lm.isProviderEnabled(p)) continue
            val loc = try { lm.getLastKnownLocation(p) } catch (e: SecurityException) { null }
            if (loc != null) { maybeSend(loc); return }
        }
        Log.i(TAG, "No last known location — waiting for a fresh fix")
    }

    /**
     * Pede uma posição NOVA ao sistema (não só a cache). É isto que faz a
     * localização aparecer em telemóveis onde nada mais usa GPS.
     */
    @SuppressLint("MissingPermission")
    private fun requestFreshFix() {
        if (!hasPermission()) return
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val provider = when {
            lm.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
            lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
            else -> {
                Log.w(TAG, "No location provider enabled (GPS off?)")
                return
            }
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                lm.getCurrentLocation(provider, null, context.mainExecutor) { loc ->
                    if (loc != null) maybeSend(loc)
                }
            } else {
                // Pré-30: um único update via listener, removido após o 1.º fix.
                Handler(Looper.getMainLooper()).post {
                    val listener = object : LocationListener {
                        override fun onLocationChanged(loc: Location) {
                            maybeSend(loc)
                            try { lm.removeUpdates(this) } catch (_: Exception) {}
                        }
                        @Deprecated("deprecated in API 29")
                        override fun onStatusChanged(p: String?, status: Int, extras: Bundle?) {}
                        override fun onProviderEnabled(p: String) {}
                        override fun onProviderDisabled(p: String) {}
                    }
                    try {
                        lm.requestLocationUpdates(provider, 0L, 0f, listener, Looper.getMainLooper())
                    } catch (e: Exception) {
                        Log.w(TAG, "requestLocationUpdates failed", e)
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "requestFreshFix failed", e)
        }
    }

    /** Envia apenas se mudou >25 m ou passaram >30 s desde o último envio. */
    private fun maybeSend(loc: Location) {
        val should = lastSent == null ||
            loc.distanceTo(lastSent!!) > 25f ||
            (System.currentTimeMillis() - lastSent!!.time > 30_000)
        if (should) sendLocation(loc)
    }

    private fun sendLocation(loc: Location) {
        lastSent = loc
        val ts = System.currentTimeMillis()
        val event = mapOf(
            "type" to "location",
            "payload" to mapOf(
                "latitude" to loc.latitude,
                "longitude" to loc.longitude,
                "accuracy" to (if (loc.hasAccuracy()) loc.accuracy.toDouble() else null),
                "speed" to (if (loc.hasSpeed()) loc.speed.toDouble() else 0.0),
                "altitude" to (if (loc.hasAltitude()) loc.altitude else null),
                "bearing" to (if (loc.hasBearing()) loc.bearing.toDouble() else null),
                "battery" to readBatteryLevel(),
                "timestamp" to ts
            )
        )
        scope.launch {
            val ok = apiClient.ingest(listOf(event))
            if (!ok) Log.w(TAG, "Failed to ingest location")
            else Log.d(TAG, "Location sent: ${loc.latitude}, ${loc.longitude}")
        }
    }

    /** Lê a percentagem de bateria real (0..100), ou null se indisponível. */
    private fun readBatteryLevel(): Int? {
        return try {
            val f = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            val status = context.registerReceiver(null, f) ?: return null
            val level = status.getIntExtra("level", -1)
            val scale = status.getIntExtra("scale", -1)
            if (level < 0 || scale <= 0) null else (level * 100 / scale)
        } catch (e: Exception) {
            null
        }
    }

    private fun hasPermission(): Boolean {
        val fine = ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        return fine || coarse
    }

    companion object {
        const val TAG = "SP-Location"
    }
}
