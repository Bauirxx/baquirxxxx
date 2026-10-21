package com.screenporter.companion.capture

/**
 * Parses H.264 Annex-B NAL units and detects keyframes (IDR = NAL type 5).
 *
 * Why: the MediaCodec BUFFER_FLAG_KEY_FRAME flag is unreliable across vendors.
 * NAL type 5 (IDR slice) is the spec-correct way to detect a keyframe.
 *
 * Each NAL unit starts with a start code: 00 00 01 or 00 00 00 01.
 * The first byte after the start code is the NAL header: forbidden_zero_bit (1)
 * | nal_ref_idc (2) | nal_unit_type (5). Type 5 = IDR slice (keyframe).
 *
 * SPS (type 7) and PPS (type 8) are "parameter sets" — they must be sent
 * before each keyframe so the decoder can recover after a reconnect.
 */
object NalUnitParser {

    private val START_CODE_3 = byteArrayOf(0, 0, 1)
    private val START_CODE_4 = byteArrayOf(0, 0, 0, 1)

    const val NAL_SLICE = 1
    const val NAL_IDR = 5
    const val NAL_SEI = 6
    const val NAL_SPS = 7
    const val NAL_PPS = 8

    data class NalUnit(
        val type: Int,
        val offset: Int,
        val length: Int
    )

    data class FrameInfo(
        val isKeyframe: Boolean,
        val configBytes: ByteArray, // SPS+PPS concatenated (Annex-B), or empty if not present
        val payload: ByteArray, // Full Annex-B frame including start codes
        val timestampUs: Long
    )

    /**
     * Parse a buffer of Annex-B H.264 data into NAL units.
     */
    fun parseNalUnits(data: ByteArray): List<NalUnit> {
        val units = mutableListOf<NalUnit>()
        var i = 0
        var lastStart = -1
        while (i < data.size - 3) {
            // Look for start code (3 or 4 byte)
            val isStart3 = data[i] == 0.toByte() && data[i + 1] == 0.toByte() && data[i + 2] == 1.toByte()
            val isStart4 = (i + 3 < data.size) && data[i] == 0.toByte() && data[i + 1] == 0.toByte() &&
                data[i + 2] == 0.toByte() && data[i + 3] == 1.toByte()
            if (isStart3 || isStart4) {
                if (lastStart >= 0) {
                    val type = (data[lastStart].toInt() and 0x7F).ushr(5)
                    val nalType = type and 0x1F
                    // Wait — actually: NAL header byte: forbidden_zero_bit(1) | nal_ref_idc(2) | nal_unit_type(5)
                    // So nal_unit_type = byte & 0x1F
                    val nalTypeCorrect = data[lastStart].toInt() and 0x1F
                    val endIdx = i
                    val length = endIdx - lastStart
                    units.add(NalUnit(nalTypeCorrect, lastStart, length))
                }
                // Skip start code
                val headerOffset = if (isStart4) i + 4 else i + 3
                lastStart = headerOffset
                i = headerOffset
            } else {
                i++
            }
        }
        // Last NAL
        if (lastStart >= 0) {
            val nalType = data[lastStart].toInt() and 0x1F
            units.add(NalUnit(nalType, lastStart, data.size - lastStart))
        }
        return units
    }

    /**
     * Given a MediaCodec output buffer (Annex-B), determine if it's a keyframe (contains
     * NAL type 5 = IDR), and extract the SPS+PPS config bytes (NAL types 7 and 8).
     */
    fun analyzeFrame(data: ByteArray, timestampUs: Long): FrameInfo {
        val nals = parseNalUnits(data)
        var isKeyframe = false
        val configBuf = StringBuilder() // we'll build config bytes as Concat

        // Extract config bytes (SPS + PPS) — collect them
        val configBytes = mutableListOf<Byte>()
        for (n in nals) {
            if (n.type == NAL_IDR) isKeyframe = true
            if (n.type == NAL_SPS || n.type == NAL_PPS) {
                // Prepend start code (4 bytes) + NAL data
                for (b in START_CODE_4) configBytes.add(b)
                for (j in 0 until n.length) configBytes.add(data[n.offset + j])
            }
        }
        return FrameInfo(
            isKeyframe = isKeyframe,
            configBytes = configBytes.toByteArray(),
            payload = data,
            timestampUs = timestampUs
        )
    }

    /**
     * SPS/PPS config bytes prepended to a keyframe so the decoder can sync.
     */
    fun buildConfigPrependFrame(spsPps: ByteArray, keyframe: ByteArray): ByteArray {
        val out = ByteArray(spsPps.size + keyframe.size)
        System.arraycopy(spsPps, 0, out, 0, spsPps.size)
        System.arraycopy(keyframe, 0, out, spsPps.size, keyframe.size)
        return out
    }
}
