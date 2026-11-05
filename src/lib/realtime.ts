// GuardianLink — Cliente WebSocket (realtime)
// Conecta ao mini-service na porta 3003 via Caddy gateway
import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

export function getRealtimeSocket(): Socket {
  if (socket) return socket
  // Liga diretamente ao serviço de tempo real (porta 3003), no mesmo host do painel
  // (localhost em dev, ou o IP do Tailscale quando acedido pelo telemovel).
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
  socket = io(`http://${host}:3003`, {
    path: '/',
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionDelay: 1500,
    reconnectionAttempts: 20,
  })
  return socket
}

export type RealtimeEvent =
  | { type: 'location'; deviceId: string; data: { latitude: number; longitude: number; accuracy: number | null; battery: number | null; timestamp: string } }
  | { type: 'call'; deviceId: string; data: { phoneNumber: string; direction: string; duration: number; timestamp: string } }
  | { type: 'sms'; deviceId: string; data: { phoneNumber: string; direction: string; body: string; flagged: boolean; timestamp: string } }
  | { type: 'app'; deviceId: string; data: { packageName: string; appName: string; foregroundMs: number; timestamp: string } }
  | { type: 'browser'; deviceId: string; data: { url: string; category: string | null; blocked: boolean; timestamp: string } }
  | { type: 'alert'; deviceId: string; data: { platform: string; severity: string; category: string; snippet: string; timestamp: string } }
  | { type: 'sos'; deviceId: string; data: { latitude: number | null; longitude: number | null; battery: number | null; trigger: string; timestamp: string } }

export function subscribeRealtime(
  userId: string,
  handlers: {
    onEvent?: (event: RealtimeEvent) => void
    onConnect?: () => void
    onDisconnect?: () => void
  }
) {
  const s = getRealtimeSocket()
  s.emit('subscribe', { userId })
  const onEvt = (event: RealtimeEvent) => handlers.onEvent?.(event)
  const onConn = () => handlers.onConnect?.()
  const onDisc = () => handlers.onDisconnect?.()
  s.on('event', onEvt)
  s.on('connect', onConn)
  s.on('disconnect', onDisc)
  return () => {
    s.off('event', onEvt)
    s.off('connect', onConn)
    s.off('disconnect', onDisc)
    s.emit('unsubscribe', { userId })
  }
}
