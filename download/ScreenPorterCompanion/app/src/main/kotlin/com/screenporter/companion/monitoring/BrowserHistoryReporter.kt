package com.screenporter.companion.monitoring
import kotlinx.coroutines.runBlocking

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import androidx.core.content.ContextCompat
import com.screenporter.companion.network.ApiClient
import com.screenporter.companion.util.PreferencesManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Reads browser history (Chrome) periodically and reports new URLs visited.
 *
 * Requires READ_HISTORY_BOOKMARKS permission. Many modern browsers (Chrome 80+)
 * no longer expose their history via the public provider; in that case the
 * companion reports only system-managed bookmarks (if any).
 *
 * For richer browsing supervision, the server can also rely on Accessibility events
 * (BrowserActivity URLs) — implemented in ControlAccessibilityService.
 */
class BrowserHistoryReporter(
    private val context: Context,
    private val prefs: PreferencesManager,
    private val apiClient: ApiClient,
    private val alertDetector: AlertDetector
) {
    private val scope = CoroutineScope(Dispatchers.IO + Job())
    private var reportingJob: Job? = null

    fun start() {
        if (!hasPermission()) {
            Log.w(TAG, "READ_HISTORY_BOOKMARKS not granted — not starting")
            return
        }
        reportingJob?.cancel()
        reportingJob = scope.launch {
            while (true) {
                sendNewHistory()
                delay(10 * 60 * 1000) // 10 min
            }
        }
    }

    fun stop() {
        reportingJob?.cancel()
        reportingJob = null
    }

        /**
     * Browser history via the public provider android.provider.Browser.BOOKMARKS_URI
     * was deprecated in API 21 and removed in modern Android SDKs.
     * Modern browsers (Chrome 80+) no longer expose history via content providers.
     * 
     * This function is a no-op stub. For richer browsing supervision, the server
     * can rely on Accessibility events (BrowserActivity URLs) — implemented in
     * ControlAccessibilityService.onAccessibilityEvent().
     */
    private fun sendNewHistory() {
        // TODO: implement via Accessibility events captured in ControlAccessibilityService
        // (the BrowserHistoryReporter approach via ContentResolver no longer works on modern Android)
        Log.i(TAG, "Browser history reporting not available on modern Android")
    }

    private fun categorize(url: String): String {
        val lower = url.lowercase()
        return when {
            "instagram.com" in lower || "facebook.com" in lower || "tiktok.com" in lower ||
            "snapchat.com" in lower || "twitter.com" in lower || "x.com" in lower -> "social"
            "youtube.com" in lower || "youtube-nocookie.com" in lower -> "games"
            "porn" in lower || "xxx" in lower || "adult" in lower || "sex" in lower -> "adult"
            "wikipedia.org" in lower || "khanacademy.org" in lower || "coursera.org" in lower -> "education"
            "amazon." in lower || "ebay." in lower || "aliexpress." in lower -> "shopping"
            "news" in lower || "cnn.com" in lower || "bbc.com" in lower || "reuters.com" in lower -> "news"
            else -> "other"
        }
    }

    private fun hasPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context, "android.permission.READ_HISTORY_BOOKMARKS"
        ) == PackageManager.PERMISSION_GRANTED
    }

    companion object {
        const val TAG = "SP-Browser"
        private const val KEY_LAST_BROWSER_TS = "last_browser_ts"
    }
}
