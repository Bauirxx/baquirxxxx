package com.screenporter.companion.install

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.google.zxing.integration.android.IntentIntegrator
import com.google.zxing.integration.android.IntentResult
import com.screenporter.companion.MainActivity
import com.screenporter.companion.R
import com.screenporter.companion.ScreenPorterApp
import com.screenporter.companion.consent.ConsentActivity
import com.screenporter.companion.util.PreferencesManager

/**
 * QR Scanner activity — scans a QR code displayed on the parent's web dashboard
 * and auto-configures the app.
 *
 * QR format (JSON encoded):
 *   {
 *     "server": "100.88.155.59:4820",
 *     "user": "parent",
 *     "token": "abc123",
 *     "jurisdiction": "BR"
 *   }
 *
 * Or URL deep link:
 *   screenporter://setup?server=...&user=...&token=...&jurisdiction=...
 *
 * After scanning, the activity:
 *  1. Saves server + user + token to prefs
 *  2. Opens ConsentActivity with the selected jurisdiction (or MainActivity if consent already signed)
 */
class QrScannerActivity : AppCompatActivity() {

    companion object {
        const val TAG = "SP-QrScanner"
    }

    private lateinit var prefs: PreferencesManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = (application as ScreenPorterApp).prefs

        // Launch ZXing scanner immediately
        IntentIntegrator(this).apply {
            setOrientationLocked(false)
            setPrompt(getString(R.string.qr_prompt))
            setBeepEnabled(true)
            setDesiredBarcodeFormats(listOf(IntentIntegrator.QR_CODE))
        }.initiateScan()
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        val result: IntentResult? = IntentIntegrator.parseActivityResult(requestCode, resultCode, data)
        if (result == null || result.contents == null) {
            Toast.makeText(this, getString(R.string.qr_cancelled), Toast.LENGTH_SHORT).show()
            finish()
            return
        }
        if (!applyScanResult(result.contents)) {
            Toast.makeText(this, getString(R.string.qr_invalid), Toast.LENGTH_LONG).show()
        }
        finish()
    }

    /**
     * Apply the scanned QR content to the prefs.
     * Supports both JSON and URL deep link formats.
     */
    private fun applyScanResult(content: String): Boolean {
        val cfg = parseQrContent(content) ?: return false

        // Save to prefs
        prefs.serverAddress = cfg.server
        prefs.serverUser = cfg.user
        if (!cfg.token.isNullOrEmpty()) prefs.authToken = cfg.token

        // If consent not yet signed, go to ConsentActivity
        if (!prefs.consentSigned) {
            val intent = Intent(this, ConsentActivity::class.java).apply {
                putExtra(ConsentActivity.EXTRA_JURISDICTION, cfg.jurisdiction ?: "BR")
                putExtra(ConsentActivity.EXTRA_FROM_DEEP_LINK, true)
            }
            startActivity(intent)
        } else {
            // Go back to MainActivity (which will show all green)
            val intent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            startActivity(intent)
        }
        Toast.makeText(this, getString(R.string.qr_success), Toast.LENGTH_SHORT).show()
        return true
    }

    data class QrConfig(
        val server: String,
        val user: String,
        val token: String?,
        val jurisdiction: String?
    )

    private fun parseQrContent(content: String): QrConfig? {
        // Try deep link first: screenporter://setup?...
        if (content.startsWith("screenporter://setup")) {
            val uri = android.net.Uri.parse(content)
            return QrConfig(
                server = uri.getQueryParameter("server") ?: return null,
                user = uri.getQueryParameter("user") ?: return null,
                token = uri.getQueryParameter("token"),
                jurisdiction = uri.getQueryParameter("jurisdiction")
            )
        }
        // Try JSON
        if (content.startsWith("{")) {
            return try {
                val json = org.json.JSONObject(content)
                QrConfig(
                    server = json.optString("server", ""),
                    user = json.optString("user", ""),
                    token = json.optString("token", null),
                    jurisdiction = json.optString("jurisdiction", null)
                )
            } catch (e: Exception) { null }
        }
        return null
    }
}
