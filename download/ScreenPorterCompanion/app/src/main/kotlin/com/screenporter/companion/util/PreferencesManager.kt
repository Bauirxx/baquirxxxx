package com.screenporter.companion.util

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit

class PreferencesManager(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    /** Exposes the underlying SharedPreferences for helper extensions. */
    fun getSharedPreferences(): SharedPreferences = prefs

    // Server settings
    var serverAddress: String
        get() = prefs.getString(KEY_SERVER_ADDRESS, "") ?: ""
        set(value) = prefs.edit { putString(KEY_SERVER_ADDRESS, value) }

    var serverUser: String
        get() = prefs.getString(KEY_SERVER_USER, "") ?: ""
        set(value) = prefs.edit { putString(KEY_SERVER_USER, value) }

    var serverPassword: String
        get() = prefs.getString(KEY_SERVER_PASSWORD, "") ?: ""
        set(value) = prefs.edit { putString(KEY_SERVER_PASSWORD, value) }

    // Auth token (after login)
    var authToken: String?
        get() = prefs.getString(KEY_AUTH_TOKEN, null)
        set(value) = prefs.edit { putString(KEY_AUTH_TOKEN, value) }

    // Unique device ID (generated once per install)
    val deviceId: String
        get() {
            var id = prefs.getString(KEY_DEVICE_ID, null)
            if (id == null) {
                id = "app-" + System.currentTimeMillis().toString(36) + "-" +
                    (1..4).map { ('a'..'z').random() }.joinToString("")
                prefs.edit { putString(KEY_DEVICE_ID, id) }
            }
            return id
        }

    // Connection state
    var isConnected: Boolean
        get() = prefs.getBoolean(KEY_IS_CONNECTED, false)
        set(value) = prefs.edit { putBoolean(KEY_IS_CONNECTED, value) }

    var lastConnectionMode: String
        get() = prefs.getString(KEY_LAST_MODE, "control") ?: "control"
        set(value) = prefs.edit { putString(KEY_LAST_MODE, value) }

    // Has the user granted MediaProjection at least once (we'll request again on next start)
    var hasVideoAuth: Boolean
        get() = prefs.getBoolean(KEY_HAS_VIDEO_AUTH, false)
        set(value) = prefs.edit { putBoolean(KEY_HAS_VIDEO_AUTH, value) }

    // ============================================================
    // CONSENT (GuardianLink)
    // ============================================================
    var consentSigned: Boolean
        get() = prefs.getBoolean(KEY_CONSENT_SIGNED, false)
        set(value) = prefs.edit { putBoolean(KEY_CONSENT_SIGNED, value) }

    var consentJurisdiction: String
        get() = prefs.getString(KEY_CONSENT_JURISDICTION, "") ?: ""
        set(value) = prefs.edit { putString(KEY_CONSENT_JURISDICTION, value) }

    var consentSignedAt: Long
        get() = prefs.getLong(KEY_CONSENT_SIGNED_AT, 0L)
        set(value) = prefs.edit { putLong(KEY_CONSENT_SIGNED_AT, value) }

    var consentLegalVersion: String
        get() = prefs.getString(KEY_CONSENT_LEGAL_VERSION, "") ?: ""
        set(value) = prefs.edit { putString(KEY_CONSENT_LEGAL_VERSION, value) }

    // ============================================================
    // SOS OVERLAY (GuardianLink)
    // ============================================================
    var sosOverlayEnabled: Boolean
        get() = prefs.getBoolean(KEY_SOS_OVERLAY, false)
        set(value) = prefs.edit { putBoolean(KEY_SOS_OVERLAY, value) }

    // ============================================================
    // DEEP LINK SETUP ( instalação fácil)
    // ============================================================
    var setupCompleted: Boolean
        get() = prefs.getBoolean(KEY_SETUP_COMPLETED, false)
        set(value) = prefs.edit { putBoolean(KEY_SETUP_COMPLETED, value) }

    companion object {
        private const val PREFS_NAME = "screenporter_prefs"
        private const val KEY_SERVER_ADDRESS = "server_address"
        private const val KEY_SERVER_USER = "server_user"
        private const val KEY_SERVER_PASSWORD = "server_password"
        private const val KEY_AUTH_TOKEN = "auth_token"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_IS_CONNECTED = "is_connected"
        private const val KEY_LAST_MODE = "last_mode"
        private const val KEY_HAS_VIDEO_AUTH = "has_video_auth"
        private const val KEY_CONSENT_SIGNED = "consent_signed"
        private const val KEY_CONSENT_JURISDICTION = "consent_jurisdiction"
        private const val KEY_CONSENT_SIGNED_AT = "consent_signed_at"
        private const val KEY_CONSENT_LEGAL_VERSION = "consent_legal_version"
        private const val KEY_SOS_OVERLAY = "sos_overlay"
        private const val KEY_SETUP_COMPLETED = "setup_completed"
    }
}
