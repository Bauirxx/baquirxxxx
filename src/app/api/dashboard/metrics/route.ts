import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getUserOr401, json } from '@/lib/api-helpers'
import type { SyncMetricsDTO, SyncEventDTO } from '@/lib/types'

// GET — métricas de sincronização + histórico recente
export async function GET(_req: NextRequest) {
  const { user, response } = await getUserOr401()
  if (response || !user) return response

  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const events = await db.syncEvent.findMany({
    where: { userId: user.id, timestamp: { gte: last24h } },
    orderBy: { timestamp: 'desc' },
    take: 500,
  })

  const commands24h = events.length
  const successTotal = events.reduce((s, e) => s + e.successCount, 0)
  const failTotal = events.reduce((s, e) => s + e.failCount, 0)
  const precision = commands24h > 0 ? successTotal / (successTotal + failTotal) : 1
  const avgDeviation = events.length > 0
    ? events.reduce((s, e) => s + e.avgDeviation, 0) / events.length
    : 0
  const maxDeviation = events.length > 0
    ? Math.max(...events.map(e => e.maxDeviation))
    : 0
  const failures24h = events.reduce((s, e) => s + e.failCount, 0)
  // Timeouts = falhas com erro 'timeout' (extraído do targetsJson)
  let timeouts24h = 0
  for (const e of events) {
    try {
      const targets = JSON.parse(e.targetsJson)
      timeouts24h += targets.filter((t: any) => t.error === 'timeout').length
    } catch {}
  }

  // Comandos por hora (24 buckets)
  const now = new Date()
  const buckets: { hour: string; count: number }[] = []
  for (let i = 23; i >= 0; i--) {
    const bucketStart = new Date(now.getTime() - (i + 1) * 60 * 60 * 1000)
    const bucketEnd = new Date(now.getTime() - i * 60 * 60 * 1000)
    const count = events.filter(e => e.timestamp >= bucketStart && e.timestamp < bucketEnd).length
    buckets.push({
      hour: bucketEnd.getHours().toString().padStart(2, '0') + 'h',
      count,
    })
  }

  // Desvio por aparelho
  const deviceMap = new Map<string, { deviceName: string; deviations: number[]; count: number }>()
  for (const e of events) {
    try {
      const targets = JSON.parse(e.targetsJson)
      for (const t of targets) {
        const cur = deviceMap.get(t.deviceId)
        if (cur) {
          cur.deviations.push(t.deviationMs)
          cur.count++
        } else {
          deviceMap.set(t.deviceId, {
            deviceName: t.deviceName,
            deviations: [t.deviationMs],
            count: 1,
          })
        }
      }
    } catch {}
  }
  const deviationByDevice = Array.from(deviceMap.entries()).map(([deviceId, v]) => ({
    deviceId,
    deviceName: v.deviceName,
    deviation: v.deviations.reduce((s, d) => s + d, 0) / Math.max(1, v.deviations.length),
  })).sort((a, b) => b.deviation - a.deviation).slice(0, 10)

  // Eventos recentes (últimos 20)
  const recentEvents: SyncEventDTO[] = events.slice(0, 20).map(e => {
    let targets: any[] = []
    try { targets = JSON.parse(e.targetsJson) } catch {}
    return {
      id: e.id,
      sourceDeviceId: null,
      commandType: e.commandType as SyncEventDTO['commandType'],
      mode: e.mode as SyncEventDTO['mode'],
      successCount: e.successCount,
      failCount: e.failCount,
      avgDeviation: e.avgDeviation,
      maxDeviation: e.maxDeviation,
      timestamp: e.timestamp.toISOString(),
      targets,
    }
  })

  const metrics: SyncMetricsDTO = {
    commands24h,
    precision,
    avgDeviation,
    maxDeviation,
    failures24h,
    timeouts24h,
    commandsPerHour: buckets,
    deviationByDevice,
    recentEvents,
  }

  return json(metrics)
}
