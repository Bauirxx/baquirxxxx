package com.screenporter.companion.network

import com.screenporter.companion.util.PreferencesManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * HTTP client for login + token retrieval + agent ingest.
 * The server is the user's own ScreenPorter PC (Tailscale or LAN).
 */
class ApiClient(private val prefs: PreferencesManager) {

    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .build()

    /**
     * POST /api/auth/login with username/password -> token.
     * Returns true on success and stores the token in prefs.
     */
    suspend fun login(): Boolean = withContext(Dispatchers.IO) {
        val addr = prefs.serverAddress.trimEnd('/')
        if (addr.isEmpty() || prefs.serverUser.isEmpty()) return@withContext false

        val url = if (addr.startsWith("http")) "$addr/api/auth/login"
                  else "http://$addr/api/auth/login"

        val body = JSONObject().apply {
            put("username", prefs.serverUser)
            put("password", prefs.serverPassword)
        }.toString().toRequestBody("application/json".toMediaType())

        val req = Request.Builder().url(url).post(body).build()
        try {
            http.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext false
                val respBody = resp.body?.string() ?: return@withContext false
                val json = JSONObject(respBody)
                val token = json.optJSONObject("user")?.optString("id") ?: return@withContext false
                prefs.authToken = json.optString("token", "")
                if (prefs.authToken.isNullOrEmpty()) return@withContext false
                true
            }
        } catch (e: Exception) {
            false
        }
    }

    /**
     * POST /api/agent/ingest with X-Agent-Token header.
     * Sends an array of events (location, call, sms, app, browser, alert, sos,
     * installed_apps, consent).
     */
    suspend fun ingest(events: List<Map<String, Any>>): Boolean = withContext(Dispatchers.IO) {
        val addr = prefs.serverAddress.trimEnd('/')
        if (addr.isEmpty()) return@withContext false
        val token = prefs.authToken ?: return@withContext false

        val url = if (addr.startsWith("http")) "$addr/api/agent/ingest"
                  else "http://$addr/api/agent/ingest"

        val jsonStr = buildJson(events)
        val req = Request.Builder()
            .url(url)
            .header("X-Agent-Token", token)
            .header("Content-Type", "application/json")
            .post(jsonStr.toRequestBody("application/json".toMediaType()))
            .build()

        try {
            http.newCall(req).execute().use { it.isSuccessful }
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Build JSON manually from List<Map<String, Any>> (handles nested maps + lists).
     */
    private fun buildJson(events: List<Map<String, Any>>): String {
        val sb = StringBuilder()
        sb.append("{\"events\":[")
        events.forEachIndexed { i, ev ->
            if (i > 0) sb.append(",")
            appendMap(sb, ev)
        }
        sb.append("]}")
        return sb.toString()
    }

    private fun appendMap(sb: StringBuilder, m: Map<String, Any>) {
        sb.append("{")
        var first = true
        for ((k, v) in m) {
            if (!first) sb.append(",")
            first = false
            sb.append("\"").append(escape(k)).append("\":")
            appendValue(sb, v)
        }
        sb.append("}")
    }

    private fun appendValue(sb: StringBuilder, v: Any?) {
        when (v) {
            null -> sb.append("null")
            is String -> sb.append("\"").append(escape(v)).append("\"")
            is Number -> sb.append(v.toString())
            is Boolean -> sb.append(v.toString())
            is Map<*, *> -> {
                @Suppress("UNCHECKED_CAST")
                appendMap(sb, v as Map<String, Any>)
            }
            is List<*> -> {
                sb.append("[")
                v.forEachIndexed { i, item ->
                    if (i > 0) sb.append(",")
                    appendValue(sb, item)
                }
                sb.append("]")
            }
            else -> sb.append("null")
        }
    }

    private fun escape(s: String): String =
        s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r")
}
