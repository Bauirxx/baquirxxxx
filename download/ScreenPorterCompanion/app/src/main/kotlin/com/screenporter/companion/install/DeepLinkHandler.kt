package com.screenporter.companion.install

import android.content.Intent
import android.net.Uri
import android.util.Log
import com.screenporter.companion.MainActivity
import com.screenporter.companion.ScreenPorterApp
import com.screenporter.companion.consent.ConsentActivity
import com.screenporter.companion.util.PreferencesManager

/**
 * Handles deep links of the form:
 *   screenporter://setup?server=100.88.155.59:4820&user=parent&token=abc123&jurisdiction=BR
 *
 * Registered in AndroidManifest with the `screenporter://setup` scheme. When the user
 * clicks such a link (e.g. from an email, SMS, or the web dashboard's "Send link to phone"),
 * Android opens our MainActivity (which has the intent-filter), which then calls us.
 *
 * This auto-fills the server config + token, skipping manual entry — installation is
 * literally a click.
 */
object DeepLinkHandler {

    const val TAG = "SP-DeepLink"

    /**
     * Apply a deep link to prefs. Returns true on success, false on malformed.
     */
    fun handle(intent: Intent, prefs: PreferencesManager): Boolean {
        val data: Uri = intent.data ?: return false
        if (data.scheme != "screenporter" || data.host != "setup") return false

        val server = data.getQueryParameter("server")
        val user = data.getQueryParameter("user")
        val token = data.getQueryParameter("token")
        val jurisdiction = data.getQueryParameter("jurisdiction") ?: "BR"

        if (server.isNullOrEmpty() || user.isNullOrEmpty()) {
            Log.w(TAG, "Deep link missing server/user")
            return false
        }

        prefs.serverAddress = server
        prefs.serverUser = user
        if (!token.isNullOrEmpty()) prefs.authToken = token
        prefs.setupCompleted = true
        Log.i(TAG, "Deep link applied: server=$server, user=$user, jurisdiction=$jurisdiction")
        return true
    }

    /**
     * Launch the consent wizard if needed, otherwise stay on MainActivity.
     */
    fun routeAfterSetup(activity: MainActivity, prefs: PreferencesManager, jurisdiction: String = "BR") {
        if (!prefs.consentSigned) {
            val i = Intent(activity, ConsentActivity::class.java).apply {
                putExtra(ConsentActivity.EXTRA_JURISDICTION, jurisdiction)
                putExtra(ConsentActivity.EXTRA_FROM_DEEP_LINK, true)
            }
            activity.startActivity(i)
        }
    }
}
