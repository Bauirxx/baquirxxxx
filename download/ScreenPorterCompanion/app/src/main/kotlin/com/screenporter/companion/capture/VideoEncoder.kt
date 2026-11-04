package com.screenporter.companion.capture

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.os.Build
import android.view.Surface
import java.nio.ByteBuffer

/**
 * H.264 (AVC) encoder using MediaCodec.
 *
 * Configuration (~1.2 Mbps, 15 fps, 2s keyframe interval):
 *   - MIME: "video/avc"
 *   - COLOR_FORMAT: COLOR_FormatSurface (we feed a Surface from MediaProjection)
 *   - BIT_RATE: 1.2 Mbps (good balance)
 *   - FRAME_RATE: 15 fps (sufficient for screen mirroring; lowers bandwidth)
 *   - I_FRAME_INTERVAL: 2 seconds (keyframe every 30 frames)
 *   - BITRATE_MODE: VBR
 *
 * Output is Annex-B (start codes + NAL units). The MediaCodec BUFFER_FLAG_KEY_FRAME
 * flag is unreliable; we use NalUnitParser instead.
 */
class VideoEncoder(
    private val width: Int,
    private val height: Int,
    private val onFrame: (FrameData) -> Unit
) {
    data class FrameData(
        val payload: ByteArray,    // Raw Annex-B bytes (config + NAL units)
        val isKeyframe: Boolean,
        val isConfig: Boolean,     // SPS/PPS only
        val timestampUs: Long
    )

    private var codec: MediaCodec? = null
    private var inputSurface: Surface? = null
    @Volatile private var isRunning = false
    private var lastConfigBytes: ByteArray = ByteArray(0)
    private var bufferInfo = MediaCodec.BufferInfo()

    /**
     * Cria o codificador H.264 por SUPERFÍCIE e devolve a superfície de ENTRADA
     * que o MediaProjection deve alimentar (via VirtualDisplay).
     *
     * CRÍTICO: um codificador por superfície cria a SUA PRÓPRIA entrada com
     * `createInputSurface()` — é essa que alimenta o VirtualDisplay. O código
     * antigo usava `SurfaceTexture(0)` + `setInputSurface(...)` (que exige uma
     * persistent input surface), por isso a projeção NUNCA chegava ao codificador
     * = 0 frames. (igual ao totalcontrol)
     */
    fun start(): Surface {
        val format = MediaFormat.createVideoFormat("video/avc", width, height).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
            setInteger(MediaFormat.KEY_BIT_RATE, 1_200_000)
            setInteger(MediaFormat.KEY_FRAME_RATE, 15)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                setInteger(MediaFormat.KEY_BITRATE_MODE, MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_VBR)
            }
            // NÃO definimos KEY_LOW_LATENCY: alguns codificadores Unisoc (TECNO)
            // recusam-no. O totalcontrol também não o usa.
        }

        val c = MediaCodec.createEncoderByType("video/avc")
        c.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        val surface = c.createInputSurface()
        c.start()
        codec = c
        inputSurface = surface
        isRunning = true
        Thread {
            drainOutput()
        }.apply { name = "SP-VideoEncoder"; isDaemon = true }.start()
        return surface
    }

    private fun drainOutput() {
        val c = codec ?: return
        // CRÍTICO: tudo protegido. Uma exceção não-capturada neste thread
        // (erro do codec no Unisoc, buffer, etc.) mataria o PROCESSO inteiro no
        // Android — foi o que cortava o WebSocket a 0.1s com code=1006 e 0 frames.
        // (o totalcontrol também protege o dreno e só pára o loop em caso de erro)
        var frameCount = 0
        try {
            while (isRunning) {
                val outBuf = try {
                    c.dequeueOutputBuffer(bufferInfo, 10_000)
                } catch (e: Exception) {
                    android.util.Log.e("SP-VideoEncoder", "dequeueOutputBuffer falhou após $frameCount frames", e)
                    break
                }
                when {
                    outBuf == MediaCodec.INFO_TRY_AGAIN_LATER -> continue
                    outBuf == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> continue
                    outBuf >= 0 -> {
                        try {
                            val buf = c.getOutputBuffer(outBuf)
                            if (buf != null && bufferInfo.size > 0) {
                                val data = ByteArray(bufferInfo.size)
                                buf.position(bufferInfo.offset)
                                buf.get(data, 0, bufferInfo.size)

                                // Analisa o Annex-B para detetar keyframe + config
                                val frame = NalUnitParser.analyzeFrame(data, bufferInfo.presentationTimeUs)
                                if (frame.configBytes.isNotEmpty()) {
                                    lastConfigBytes = frame.configBytes
                                }

                                // Nos keyframes: prefixa SPS/PPS (config) para o
                                // descodificador sincronizar após reconexão.
                                if (frame.isKeyframe && lastConfigBytes.isNotEmpty()) {
                                    val out = NalUnitParser.buildConfigPrependFrame(lastConfigBytes, data)
                                    onFrame(FrameData(out, true, false, frame.timestampUs))
                                } else {
                                    val isConfig = frame.configBytes.isNotEmpty() && !frame.isKeyframe
                                    onFrame(FrameData(data, frame.isKeyframe, isConfig, frame.timestampUs))
                                }
                            }
                        } catch (e: Exception) {
                            android.util.Log.w("SP-VideoEncoder", "frame #$frameCount falhou", e)
                        }
                        frameCount++
                        try { c.releaseOutputBuffer(outBuf, false) } catch (_: Exception) {}
                    }
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("SP-VideoEncoder", "dreno morreu após $frameCount frames", e)
        }
        android.util.Log.w("SP-VideoEncoder", "dreno parou — total frames produzidos: $frameCount")
    }

    fun stop() {
        isRunning = false
        try {
            codec?.stop()
            codec?.release()
        } catch (_: Exception) {}
        try { inputSurface?.release() } catch (_: Exception) {}
        codec = null
        inputSurface = null
    }
}
