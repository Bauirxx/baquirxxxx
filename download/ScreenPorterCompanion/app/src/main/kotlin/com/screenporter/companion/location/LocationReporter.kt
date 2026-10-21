package com.screenporter.companion.location

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
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
 * Updates every ~30 seconds or 25 meters, whichever comes first.
 * Also sends the last known location immediately on startup.
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
    private var lastLocation: Location? = null

    fun start() {
        if (!hasPermission()) {
            Log.w(TAG, "Location permission not granted — not starting")
            return
        }
        // Send last known immediately
        sendLastKnown()
        // Schedule periodic reports
        reportingJob?.cancel()
        reportingJob = scope.launch {
            while (true) {
                delay(30_000)
                sendCurrentIfAvailable()
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
        val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
        for (p in providers) {
            if (lm.isProviderEnabled(p)) {
                val loc = try { lm.getLastKnownLocation(p) } catch (e: SecurityException) { null }
                if (loc != null) {
                    sendLocation(loc)
                    return
                }
            }
        }
        Log.i(TAG, "No last known location")
    }

    @SuppressLint("MissingPermission")
    private fun sendCurrentIfAvailable() {
        if (!hasPermission()) return
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
        for (p in providers) {
            if (lm.isProviderEnabled(p)) {
                val loc = try { lm.getLastKnownLocation(p) } catch (e: SecurityException) { null }
                if (loc != null) {
                    // Only send if moved >25m or it's been >30s
                    val shouldSend = lastLocation == null ||
                        loc.distanceTo(lastLocation!!) > 25f ||
                        (System.currentTimeMillis() - (lastLocation!!.time) > 30_000)
                    if (shouldSend) {
                        sendLocation(loc)
                    }
                    return
                }
            }
        }
    }

    private fun sendLocation(loc: Location) {
        lastLocation = loc
        val ts = System.currentTimeMillis()
        val event = mapOf(
            "type" to "location",
            "payload" to mapOf(
                "latitude" to loc.latitude,
                "longitude" to loc.longitude,
                "accuracy" to (if (loc.hasAccuracy()) loc.accuracy.toDouble() else null),
                "speed" to (if (loc.hasSpeed()) loc.speed.toDouble() else 0.0),
                "altitude" to (if (loc.hasAltitude()) loc.altitude else null),
                "bearing" to (if (loc.hasBearing()) loc.bearing else null),
                "battery" to 100, // populated by CaptureService if available
                "timestamp" to ts
            )
        )
        scope.launch {
            val ok = apiClient.ingest(listOf(event))
            if (!ok) Log.w(TAG, "Failed to ingest location")
            else Log.d(TAG, "Location sent: ${loc.latitude}, ${loc.longitude}")
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
