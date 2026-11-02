// Descodificador H.264 (Annex-B) direto num <canvas> via WebCodecs — portado da
// implementação comprovada do ScreenPorter/totalcontrol. Chrome/Edge 94+.
// A chave: configurar com avc:{format:'annexb'} (senão o WebCodecs recusa o cru)
// e prefixar o SPS/PPS (config) ao keyframe seguinte.
export class H264Decoder {
  private decoder?: VideoDecoder
  private configuredSize?: { width: number; height: number }
  private pendingConfig: Uint8Array | null = null
  private readonly ctx: CanvasRenderingContext2D
  private needsKeyFrame = true

  onError?: (err: Error) => void

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('não foi possível obter contexto 2D do canvas')
    this.ctx = ctx
  }

  static isSupported(): boolean {
    return typeof VideoDecoder !== 'undefined' && typeof EncodedVideoChunk !== 'undefined'
  }

  private ensureConfigured(width: number, height: number): void {
    if (this.decoder && this.configuredSize?.width === width && this.configuredSize.height === height) return
    this.decoder?.close()
    this.decoder = new VideoDecoder({
      output: (frame) => this.renderFrame(frame),
      error: (err) => this.onError?.(err),
    })
    this.decoder.configure({
      codec: 'avc1.640028',
      codedWidth: width,
      codedHeight: height,
      // NAL units crus com start code (Annex-B); não montamos avcC.
      // @ts-expect-error -- 'avc' faz parte do WebCodecs AVC config, nem sempre no lib.dom.d.ts
      avc: { format: 'annexb' },
      optimizeForLatency: true,
    })
    this.configuredSize = { width, height }
    this.needsKeyFrame = true
  }

  private renderFrame(frame: VideoFrame): void {
    if (this.canvas.width !== frame.displayWidth || this.canvas.height !== frame.displayHeight) {
      this.canvas.width = frame.displayWidth
      this.canvas.height = frame.displayHeight
    }
    this.ctx.drawImage(frame, 0, 0, this.canvas.width, this.canvas.height)
    frame.close()
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
    this.ensureConfigured(width, height)
    if (!this.decoder) return

    if (isConfig) {
      this.pendingConfig = payload
      return
    }

    if (this.needsKeyFrame && !isKeyFrame) return

    let data: Uint8Array = payload
    if (this.pendingConfig) {
      const merged = new Uint8Array(this.pendingConfig.length + payload.length)
      merged.set(this.pendingConfig, 0)
      merged.set(payload, this.pendingConfig.length)
      data = merged
      this.pendingConfig = null
    }

    try {
      this.decoder.decode(
        new EncodedVideoChunk({ type: isKeyFrame ? 'key' : 'delta', timestamp: ptsMicros, data }),
      )
      this.needsKeyFrame = false
    } catch (err) {
      this.needsKeyFrame = true
      this.onError?.(err as Error)
    }
  }

  close(): void {
    try {
      this.decoder?.close()
    } catch {
      /* já pode estar fechado */
    }
  }
}
