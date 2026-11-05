// Helper server-side: envia um comando de controlo para a app Companion, através do
// relé (porta 8820), que o reencaminha pelo WebSocket aberto com a app.
// Devolve true se o comando foi mesmo entregue (app ligada), false caso contrário.
const RELAY_URL = process.env.RELAY_URL || 'http://127.0.0.1:8820'

export interface RelayStatus {
  online: Array<{ userId: string; model: string | null; width: number | null; height: number | null }>
}

// Lista os telemóveis Companion ligados ao relé agora (para estado online/offline).
export async function getRelayStatus(): Promise<RelayStatus> {
  try {
    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort(), 1000)
    const res = await fetch(`${RELAY_URL}/__relay/status`, { signal: ctrl.signal })
    clearTimeout(to)
    if (!res.ok) return { online: [] }
    return (await res.json()) as RelayStatus
  } catch {
    return { online: [] }
  }
}

export async function sendToCompanion(
  userId: string,
  message: Record<string, unknown>
): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort(), 1500)
    const res = await fetch(`${RELAY_URL}/__relay/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, message: JSON.stringify(message) }),
      signal: ctrl.signal,
    })
    clearTimeout(to)
    if (!res.ok) return false
    const data = (await res.json().catch(() => ({}))) as { delivered?: boolean }
    return !!data.delivered
  } catch {
    return false
  }
}
