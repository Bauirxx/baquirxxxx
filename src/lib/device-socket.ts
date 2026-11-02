// Ligação WebSocket a um dispositivo (vídeo + controlo), portada do totalcontrol.
// Adaptação: liga ao RELÉ na porta 8820 (o painel corre no 3000).
// Formato do pacote de vídeo (12 bytes + Annex-B): [high:4][low:4][size:4],
// com high bit 0x40000000=config, 0x20000000=keyframe, resto = PTS alto.
const RELAY_PORT = 8820

export interface SessionMetaMsg {
  t: 'meta'
  deviceName?: string
  codec?: string
  width: number
  height: number
}

export type ServerMessage =
  | SessionMetaMsg
  | { t: 'error'; message: string }
  | { t: 'closed' }

export interface VideoPacketView {
  isConfig: boolean
  isKeyFrame: boolean
  ptsMicros: number
  payload: Uint8Array
}

export class DeviceSocket {
  private ws: WebSocket

  onMeta?: (meta: SessionMetaMsg) => void
  onVideoPacket?: (packet: VideoPacketView) => void
  onServerMessage?: (msg: ServerMessage) => void
  onOpen?: () => void
  onClose?: () => void

  constructor(deviceId: string) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    this.ws = new WebSocket(
      `${proto}//${window.location.hostname}:${RELAY_PORT}/ws/devices/${encodeURIComponent(deviceId)}`,
    )
    this.ws.binaryType = 'arraybuffer'
    this.ws.addEventListener('open', () => this.onOpen?.())
    this.ws.addEventListener('close', () => this.onClose?.())
    this.ws.addEventListener('message', (ev) => this.handleMessage(ev))
  }

  private handleMessage(ev: MessageEvent): void {
    if (typeof ev.data === 'string') {
      let msg: ServerMessage
      try {
        msg = JSON.parse(ev.data)
      } catch {
        return
      }
      if (msg.t === 'meta') this.onMeta?.(msg)
      this.onServerMessage?.(msg)
      return
    }

    const buf = ev.data as ArrayBuffer
    if (buf.byteLength < 12) return
    const view = new DataView(buf)
    const high = view.getUint32(0)
    const low = view.getUint32(4)
    const size = view.getUint32(8)
    const isConfig = (high & 0x40000000) !== 0
    const isKeyFrame = (high & 0x20000000) !== 0
    const ptsHigh = high & 0x1fffffff
    const ptsMicros = isConfig ? 0 : ptsHigh * 2 ** 32 + low
    const payload = new Uint8Array(buf, 12, size)

    this.onVideoPacket?.({ isConfig, isKeyFrame, ptsMicros, payload })
  }

  private send(obj: Record<string, unknown>): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj))
  }

  touch(action: 'down' | 'move' | 'up', pointerId: number, x: number, y: number, w: number, h: number, pressure = 1): void {
    this.send({ t: 'touch', action, pointerId, x, y, w, h, pressure })
  }

  key(action: 'down' | 'up', keycode: number): void {
    this.send({ t: 'key', action, keycode })
  }

  text(text: string): void {
    this.send({ t: 'text', text })
  }

  back(): void {
    this.send({ t: 'back' })
  }

  home(): void {
    this.send({ t: 'home' })
  }

  recents(): void {
    this.send({ t: 'recents' })
  }

  power(): void {
    this.send({ t: 'power' })
  }

  close(): void {
    this.ws.close()
  }
}
