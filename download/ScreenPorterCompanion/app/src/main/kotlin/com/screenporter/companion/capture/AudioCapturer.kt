package com.screenporter.companion.capture

import android.annotation.SuppressLint
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.projection.MediaProjection
import android.os.Build
import android.util.Log

/**
 * Captura áudio e entrega blocos de PCM 16-bit little-endian via [onPcm].
 * Escuta remota (uma via): dispositivo → dashboard.
 *
 * Duas fontes:
 *  - PLAYBACK: som interno das apps (media/jogos/vídeo), via AudioPlaybackCapture
 *    a partir da MediaProjection já existente (API 29+). NÃO apanha chamadas de
 *    voz nem apps que optam por bloquear a captura.
 *  - MIC: microfone (ambiente/conversas). Exige a permissão RECORD_AUDIO.
 *
 * O PCM é enviado cru (sem codec) — o relé reencaminha e o navegador reproduz
 * via Web Audio API. Em LAN/Tailscale a banda é folgada (16 kHz mono ≈ 256 kbps,
 * 44.1 kHz mono ≈ 705 kbps).
 */
class AudioCapturer(
    private val source: Source,
    private val projection: MediaProjection?,
    private val onPcm: (ByteArray) -> Unit,
    private val onError: (String) -> Unit,
) {
    enum class Source { PLAYBACK, MIC }

    @Volatile private var running = false
    private var thread: Thread? = null
    private var record: AudioRecord? = null

    var sampleRate = 0
        private set
    var channels = 1
        private set

    @SuppressLint("MissingPermission")
    fun start(): Boolean {
        if (running) return true
        // Mic: 16 kHz mono (voz). Playback: 44.1 kHz mono (média).
        sampleRate = if (source == Source.MIC) 16000 else 44100
        channels = 1
        val channelMask = AudioFormat.CHANNEL_IN_MONO
        val encoding = AudioFormat.ENCODING_PCM_16BIT
        val minBuf = AudioRecord.getMinBufferSize(sampleRate, channelMask, encoding)
        if (minBuf <= 0) {
            onError("Formato de áudio não suportado neste dispositivo")
            return false
        }
        val bufSize = minBuf * 2

        try {
            record = when (source) {
                Source.PLAYBACK -> buildPlaybackRecord(encoding, channelMask, bufSize) ?: return false
                Source.MIC -> buildMicRecord(encoding, channelMask, bufSize)
            }
        } catch (e: SecurityException) {
            onError("Sem permissão para captar áudio")
            return false
        } catch (e: Exception) {
            onError("Falha ao iniciar áudio: ${e.message}")
            return false
        }

        val rec = record
        if (rec == null || rec.state != AudioRecord.STATE_INITIALIZED) {
            onError("Não foi possível inicializar a captura de áudio")
            try { rec?.release() } catch (_: Exception) {}
            record = null
            return false
        }

        running = true
        try {
            rec.startRecording()
        } catch (e: Exception) {
            onError("Falha ao gravar áudio: ${e.message}")
            running = false
            try { rec.release() } catch (_: Exception) {}
            record = null
            return false
        }

        thread = Thread({
            // ~20 ms por bloco.
            val frameBytes = ((sampleRate / 50) * 2 * channels).coerceAtLeast(640)
            val buf = ByteArray(frameBytes)
            while (running) {
                val n = try { rec.read(buf, 0, buf.size) } catch (e: Exception) { -1 }
                when {
                    n > 0 -> {
                        val chunk = if (n == buf.size) buf.copyOf() else buf.copyOf(n)
                        try { onPcm(chunk) } catch (_: Exception) {}
                    }
                    n < 0 -> break
                }
            }
        }, "sp-audio-capture").apply { isDaemon = true; start() }

        Log.i(TAG, "Áudio iniciado: source=$source ${sampleRate}Hz ch=$channels")
        return true
    }

    private fun buildPlaybackRecord(encoding: Int, channelMask: Int, bufSize: Int): AudioRecord? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            onError("Som das apps requer Android 10+")
            return null
        }
        val proj = projection
        if (proj == null) {
            onError("Liga o espelhamento de vídeo primeiro (é preciso a projeção de ecrã)")
            return null
        }
        val config = AudioPlaybackCaptureConfiguration.Builder(proj)
            .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
            .addMatchingUsage(AudioAttributes.USAGE_GAME)
            .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
            .build()
        return AudioRecord.Builder()
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(encoding)
                    .setSampleRate(sampleRate)
                    .setChannelMask(channelMask)
                    .build()
            )
            .setBufferSizeInBytes(bufSize)
            .setAudioPlaybackCaptureConfig(config)
            .build()
    }

    @SuppressLint("MissingPermission")
    private fun buildMicRecord(encoding: Int, channelMask: Int, bufSize: Int): AudioRecord {
        // VOICE_RECOGNITION tende a dar áudio limpo (sem AGC agressivo). Se falhar,
        // cai para o MIC genérico.
        val vr = AudioRecord(
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            sampleRate, channelMask, encoding, bufSize
        )
        if (vr.state == AudioRecord.STATE_INITIALIZED) return vr
        try { vr.release() } catch (_: Exception) {}
        return AudioRecord(
            MediaRecorder.AudioSource.MIC,
            sampleRate, channelMask, encoding, bufSize
        )
    }

    fun stop() {
        running = false
        try { thread?.join(500) } catch (_: Exception) {}
        thread = null
        try { record?.stop() } catch (_: Exception) {}
        try { record?.release() } catch (_: Exception) {}
        record = null
        Log.i(TAG, "Áudio parado")
    }

    companion object {
        const val TAG = "SP-Audio"
    }
}
