// Registo em memória para diagnóstico (apenas para testes).
// Sobrevive ao hot-reload do dev via globalThis.
type DebugEntry = { t: string; kind: string; detail: Record<string, unknown> }

const g = globalThis as unknown as { __spDebug?: DebugEntry[] }
if (!g.__spDebug) g.__spDebug = []

export function pushDebug(kind: string, detail: Record<string, unknown>) {
  g.__spDebug!.push({ t: new Date().toISOString(), kind, detail })
  while (g.__spDebug!.length > 50) g.__spDebug!.shift()
}

export function getDebug(): DebugEntry[] {
  return g.__spDebug ?? []
}
