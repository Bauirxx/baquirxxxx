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
    @Volatile private var isRunning = false
    private var lastConfigBytes: ByteArray = ByteArray(0)
    private var bufferInfo = MediaCodec.BufferInfo()

    fun start(inputSurface: Surface) {
        val format = MediaFormat.createVideoFormat("video/avc", width, height).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
            setInteger(MediaFormat.KEY_BIT_RATE, 1_200_000)
            setInteger(MediaFormat.KEY_FRAME_RATE, 15)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                setInteger(MediaFormat.KEY_BITRATE_MODE, MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_VBR)
            }
            // Hint for low-latency on Android 11+
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                setInteger(MediaFormat.KEY_LOW_LATENCY, 1)
            }
        }

        codec = MediaCodec.createEncoderByType("video/avc").apply {
            configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            setInputSurface(inputSurface)
            start()
        }
        isRunning = true
        Thread {
            drainOutput()
        }.apply { name = "SP-VideoEncoder"; isDaemon = true }.start()
    }

    private fun drainOutput() {
        val c = codec ?: return
        while (isRunning) {
            val outBuf = c.dequeueOutputBuffer(bufferInfo, 10_000)
            when {
                outBuf == MediaCodec.INFO_TRY_AGAIN_LATER -> continue
                outBuf == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> continue
                outBuf >= 0 -> {
                    val buf = c.getOutputBuffer(outBuf) ?: continue
                    val data = ByteArray(bufferInfo.size)
                    buf.position(bufferInfo.offset)
                    buf.get(data, 0, bufferInfo.size)

                    // Analyse the Annex-B payload to detect keyframe + config
                    val frame = NalUnitParser.analyzeFrame(data, bufferInfo.presentationTimeUs)
                    if (frame.configBytes.isNotEmpty()) {
                        lastConfigBytes = frame.configBytes
                    }

                    // For keyframes: prepend SPS/PPS (config) so the decoder can sync after reconnect
                    if (frame.isKeyframe && lastConfigBytes.isNotEmpty()) {
                        val out = NalUnitParser.buildConfigPrependFrame(lastConfigBytes, data)
                        onFrame(FrameData(out, true, false, frame.timestampUs))
                    } else {
                        val isConfig = frame.configBytes.isNotEmpty() && !frame.isKeyframe
                        onFrame(FrameData(data, frame.isKeyframe, isConfig, frame.timestampUs))
                    }
                    c.releaseOutputBuffer(outBuf, false)
                }
            }
        }
    }

    fun stop() {
        isRunning = false
        try {
            codec?.stop()
            codec?.release()
        } catch (_: Exception) {}
        codec = null
    }
}
