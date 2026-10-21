// GuardianLink — Helper server-side para emitir eventos em tempo real
// Faz POST para o mini-service de websocket na porta 3003
// (server-to-server, não precisa do XTransformPort do gateway Caddy)
const REALTIME_INTERNAL_URL = 'http://127.0.0.1:3004'

export async function broadcastEvent(payload: {
  userId: string
  deviceId: string
  event: any
}) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 800)
    const res = await fetch(`${REALTIME_INTERNAL_URL}/internal/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    return res.ok
  } catch (err) {
    // silencioso: o realtime é best-effort
    return false
  }
}
