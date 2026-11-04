// Reprodutor de áudio PCM em streaming para a escuta remota.
// Recebe blocos de PCM 16-bit little-endian (como vêm do dispositivo via relé)
// e reproduz com um pequeno buffer de jitter para evitar cortes. Não precisa de
// descodificador — o PCM é cru, por isso funciona em qualquer browser com Web
// Audio API (os mesmos que já suportam o WebCodecs do vídeo).
export class PcmPlayer {
  private ctx: AudioContext | null = null
  private gain: GainNode | null = null
  private sampleRate = 16000
  private channels = 1
  private nextTime = 0
  // Atraso inicial (s) antes de começar a tocar, para absorver variação de rede.
  private readonly leadSeconds = 0.18
  private running = false
  private bytesReceived = 0

  isSupported(): boolean {
    return typeof window !== 'undefined' &&
      (typeof window.AudioContext !== 'undefined' ||
        typeof (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext !== 'undefined')
  }

  // Configura (ou reconfigura) com o formato anunciado pelo dispositivo.
  // Deve ser chamado a partir de um gesto do utilizador (clique) para que o
  // AudioContext arranque sem ser bloqueado pela política de autoplay.
  configure(sampleRate: number, channels: number): void {
    this.sampleRate = sampleRate > 0 ? sampleRate : 16000
    this.channels = channels >= 2 ? 2 : 1
    if (!this.ctx) {
      const Ctor = window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctor()
      this.gain = this.ctx.createGain()
      this.gain.gain.value = 1
      this.gain.connect(this.ctx.destination)
    }
    // Pode estar 'suspended' por política de autoplay — retoma no gesto.
    this.ctx.resume().catch(() => {})
    this.nextTime = 0
    this.running = true
  }

  setVolume(v: number): void {
    if (this.gain) this.gain.gain.value = Math.max(0, Math.min(1, v))
  }

  // Alimenta um bloco de PCM16LE. Converte para Float32 por canal, cria um
  // AudioBuffer na taxa de origem (o contexto reamostra ao reproduzir) e
  // agenda-o em sequência no relógio do contexto.
  pushPcm(bytes: Uint8Array): void {
    const ctx = this.ctx
    const gain = this.gain
    if (!ctx || !gain || !this.running) return
    // Nº de amostras inteiras (2 bytes cada), alinhado.
    const totalSamples = Math.floor(bytes.byteLength / 2)
    if (totalSamples <= 0) return
    const frames = Math.floor(totalSamples / this.channels)
    if (frames <= 0) return
    this.bytesReceived += bytes.byteLength

    // DataView sobre a fatia exata (o Uint8Array pode ter offset).
    const view = new DataView(bytes.buffer, bytes.byteOffset, totalSamples * 2)
    let buffer: AudioBuffer
    try {
      buffer = ctx.createBuffer(this.channels, frames, this.sampleRate)
    } catch {
      return
    }
    for (let ch = 0; ch < this.channels; ch++) {
      const out = buffer.getChannelData(ch)
      for (let i = 0; i < frames; i++) {
        const s = view.getInt16((i * this.channels + ch) * 2, true)
        out[i] = s / 32768
      }
    }

    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(gain)

    const now = ctx.currentTime
    // Underrun (ficámos sem áudio agendado): recomeça com o lead.
    if (this.nextTime < now + 0.01) {
      this.nextTime = now + this.leadSeconds
    }
    try {
      src.start(this.nextTime)
    } catch {
      return
    }
    this.nextTime += buffer.duration
  }

  getStats(): { bytes: number } {
    return { bytes: this.bytesReceived }
  }

  stop(): void {
    this.running = false
    this.nextTime = 0
  }

  close(): void {
    this.running = false
    try { this.ctx?.close() } catch { /* noop */ }
    this.ctx = null
    this.gain = null
  }
}
