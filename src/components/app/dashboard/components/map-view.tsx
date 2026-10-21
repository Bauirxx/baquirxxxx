'use client'

// GuardianLink — Visualização minimalista de mapa (CSS grid + marcador)
// Sem dependência de biblioteca de mapa externa.
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MapPin, Battery, Gauge, Clock } from 'lucide-react'
import { useI18n } from '@/lib/i18n/context'
import type { LocationEventDTO } from '@/lib/types'

interface MapViewProps {
  events: LocationEventDTO[]
  height?: number
}

export function MapView({ events, height = 360 }: MapViewProps) {
  const { t } = useI18n()
  if (!events.length) return null

  // Encontra bounding box dos pontos
  const lats = events.map(e => e.latitude)
  const lngs = events.map(e => e.longitude)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const latRange = Math.max(maxLat - minLat, 0.0005)
  const lngRange = Math.max(maxLng - minLng, 0.0005)
  // Adiciona padding de 10%
  const padLat = latRange * 0.15
  const padLng = lngRange * 0.15
  const minLatPad = minLat - padLat
  const minLngPad = minLng - padLng
  const latRangePad = latRange + padLat * 2
  const lngRangePad = lngRange + padLng * 2

  // Projeta (lng, lat) -> (x%, y%)
  const project = (lng: number, lat: number) => ({
    x: ((lng - minLngPad) / lngRangePad) * 100,
    y: 100 - ((lat - minLatPad) / latRangePad) * 100,
  })

  const latest = events[0]
  const history = events.slice(0, Math.min(events.length, 100)).reverse()
  const latestPoint = project(latest.longitude, latest.latitude)
  const pathPoints = history.map(e => project(e.longitude, e.latitude))
  const pathStr = pathPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')

  return (
    <Card className="border-border/60 shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="font-serif-display text-lg flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          {t('location.current')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className="map-grid relative rounded-lg border border-border/40 overflow-hidden"
          style={{ height: `${height}px` }}
        >
          {/* Trajetória */}
          {pathPoints.length > 1 && (
            <svg
              className="absolute inset-0 w-full h-full"
              preserveAspectRatio="none"
              viewBox="0 0 100 100"
            >
              <path
                d={pathStr}
                stroke="var(--primary)"
                strokeWidth="0.6"
                fill="none"
                strokeOpacity="0.4"
                vectorEffect="non-scaling-stroke"
              />
              {pathPoints.slice(0, -1).map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="0.5" fill="var(--primary)" fillOpacity="0.3" vectorEffect="non-scaling-stroke" />
              ))}
            </svg>
          )}
          {/* Marcador atual */}
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-300"
            style={{ left: `${latestPoint.x}%`, top: `${latestPoint.y}%` }}
          >
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-primary/30 animate-ping" style={{ width: 24, height: 24 }} />
              <div className="relative rounded-full bg-primary border-2 border-background" style={{ width: 18, height: 18 }} />
            </div>
          </div>
          {/* Crosshair no centro */}
          <div className="absolute top-2 left-2 text-[10px] font-mono text-muted-foreground bg-background/80 px-1.5 py-0.5 rounded">
            {latest.latitude.toFixed(5)}, {latest.longitude.toFixed(5)}
          </div>
        </div>

        {/* Metadados */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetaChip icon={Clock} label={t('location.last.update')} value={new Date(latest.timestamp).toLocaleString()} />
          {latest.accuracy != null && <MetaChip icon={Gauge} label={t('location.accuracy')} value={`${latest.accuracy.toFixed(0)} m`} />}
          {latest.battery != null && <MetaChip icon={Battery} label={t('location.battery')} value={`${latest.battery}%`} />}
          {latest.speed != null && <MetaChip icon={Gauge} label={t('location.speed')} value={`${latest.speed.toFixed(1)} m/s`} />}
        </div>
      </CardContent>
    </Card>
  )
}

function MetaChip({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-muted/30 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="text-sm font-mono text-foreground mt-0.5">{value}</div>
    </div>
  )
}
