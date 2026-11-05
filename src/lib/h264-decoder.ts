// Descodificador H.264 (Annex-B) direto num <canvas> via WebCodecs.
// Extrai o codec real do SPS, tenta hardware primeiro, fallback para software.
export class H264Decoder {
  private decoder?: VideoDecoder
  private configuredSize?: { width: number; height: number }
  private configuredCodec?: string
  private pendingConfig: Uint8Array | null = null
  private detectedCodec: string | null = null
  private readonly canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D | null = null
  private needsKeyFrame = true
  private triedSoftware = false

  decodedFrames = 0
  lastError: string | null = null
  onError?: (err: Error) => void
  onFirstFrame?: () => void

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    if (!this.ctx) throw new Error('não foi possível obter contexto 2D do canvas')
  }

  static isSupported(): boolean {
    return typeof VideoDecoder !== 'undefined' && typeof EncodedVideoChunk !== 'undefined'
  }

  private createDecoder(codec: string, width: number, height: number, preferSoftware: boolean): void {
    try { this.decoder?.close() } catch { /* */ }
    this.decoder = undefined

    const hw = preferSoftware ? 'prefer-software' as HardwareAcceleration : 'prefer-hardware' as HardwareAcceleration

    this.decoder = new VideoDecoder({
      output: (frame) => {
        try {
          this.renderFrame(frame)
        } catch (e) {
          console.error('[H264] renderFrame failed', e)
          frame.close()
        }
      },
      error: (err) => {
        const msg = err?.message ?? String(err)
        console.error('[H264] decoder error (sw=' + preferSoftware + '):', msg)
        this.lastError = msg
        this.onError?.(err)
        this.needsKeyFrame = true

        if (!preferSoftware && !this.triedSoftware) {
          console.log('[H264] retrying with software decoding...')
          this.triedSoftware = true
          this.configuredSize = undefined
          this.configuredCodec = undefined
        }
      },
    })

    try {
      this.decoder.configure({
        codec,
        codedWidth: width,
        codedHeight: height,
        hardwareAcceleration: hw,
        // @ts-expect-error -- WebCodecs AVC annexb
        avc: { format: 'annexb' },
        optimizeForLatency: true,
      })
      console.log('[H264] configured:', codec, width + 'x' + height, 'hw=' + hw)
      this.configuredSize = { width, height }
      this.configuredCodec = codec
      this.needsKeyFrame = true
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e)
      console.error('[H264] configure failed:', msg)
      this.lastError = 'configure: ' + msg
      this.onError?.(new Error('configure: ' + msg))
      this.decoder = undefined
    }
  }

  private ensureConfigured(width: number, height: number): void {
    const codec = this.detectedCodec ?? 'avc1.42001f'
    const useSw = this.triedSoftware
    if (
      this.decoder &&
      this.decoder.state === 'configured' &&
      this.configuredSize?.width === width &&
      this.configuredSize.height === height &&
      this.configuredCodec === codec
    ) return
    this.createDecoder(codec, width, height, useSw)
  }

  private renderFrame(frame: VideoFrame): void {
    const w = frame.displayWidth
    const h = frame.displayHeight
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
      this.ctx = this.canvas.getContext('2d')
    }
    if (this.ctx) {
      this.ctx.drawImage(frame, 0, 0, w, h)
    }
    frame.close()
    this.decodedFrames++
    if (this.decodedFrames === 1) this.onFirstFrame?.()
  }

  handlePacket(
    isConfig: boolean,
    isKeyFrame: boolean,
    ptsMicros: number,
    payload: Uint8Array,
    width: number,
    height: number,
  ): void {
    if (!H264Decoder.isSupported()) return

    if (isConfig) {
      this.pendingConfig = payload
      const parsed = codecStringFromSps(payload)
      if (parsed && parsed !== this.detectedCodec) {
        console.log('[H264] SPS codec:', parsed, 'payload:', payload.length + 'B')
        this.detectedCodec = parsed
        this.configuredSize = undefined
        this.configuredCodec = undefined
      }
      return
    }

    this.ensureConfigured(width, height)
    if (!this.decoder || this.decoder.state !== 'configured') {
      if (this.decoder?.state === 'closed') {
        this.configuredSize = undefined
        this.configuredCodec = undefined
      }
      return
    }

    if (this.needsKeyFrame && !isKeyFrame) return

    let data: Uint8Array = payload
    if (this.pendingConfig) {
      if (!payloadStartsWithSps(payload)) {
        const merged = new Uint8Array(this.pendingConfig.length + payload.length)
        merged.set(this.pendingConfig, 0)
        merged.set(payload, this.pendingConfig.length)
        data = merged
      }
      this.pendingConfig = null
    }

    try {
      this.decoder.decode(
        new EncodedVideoChunk({ type: isKeyFrame ? 'key' : 'delta', timestamp: ptsMicros, data }),
      )
      this.needsKeyFrame = false
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err)
      console.error('[H264] decode() threw:', msg, 'key=' + isKeyFrame, 'size=' + data.length)
      this.lastError = 'decode: ' + msg
      this.needsKeyFrame = true
      this.onError?.(err as Error)
    }
  }

  close(): void {
    try { this.decoder?.close() } catch { /* */ }
  }
}

function findNalType(data: Uint8Array, type: number): number {
  for (let i = 0; i < data.length - 4; i++) {
    if (data[i] !== 0) continue
    if (data[i + 1] === 0 && data[i + 2] === 0 && data[i + 3] === 1) {
      if (i + 4 < data.length && (data[i + 4] & 0x1f) === type) return i + 4
    } else if (data[i + 1] === 0 && data[i + 2] === 1) {
      if (i + 3 < data.length && (data[i + 3] & 0x1f) === type) return i + 3
    }
  }
  return -1
}

function codecStringFromSps(configData: Uint8Array): string | null {
  const spsIdx = findNalType(configData, 7)
  if (spsIdx < 0 || spsIdx + 3 >= configData.length) return null
  const profile = configData[spsIdx + 1]
  const constraints = configData[spsIdx + 2]
  const level = configData[spsIdx + 3]
  return `avc1.${hex2(profile)}${hex2(constraints)}${hex2(level)}`
}

function payloadStartsWithSps(data: Uint8Array): boolean {
  const idx = findNalType(data, 7)
  return idx >= 0 && idx < 8
}

function hex2(n: number): string {
  return n.toString(16).padStart(2, '0')
}
