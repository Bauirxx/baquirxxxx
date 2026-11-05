'use client'

// GuardianLink — Mapa real OpenStreetMap (Leaflet + tiles OSM).
// Leaflet é carregado por CDN (sem npm install) e inicializado no cliente via ref.
import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MapPin, Battery, Gauge, Clock } from 'lucide-react'
import { useI18n } from '@/lib/i18n/context'
import type { LocationEventDTO } from '@/lib/types'

interface MapViewProps {
  events: LocationEventDTO[]
  height?: number
}

const LEAFLET_VERSION = '1.9.4'

// Carrega o Leaflet (CSS + JS) uma única vez e resolve quando window.L existe.
let leafletPromise: Promise<any> | null = null
function loadLeaflet(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  const w = window as any
  if (w.L) return Promise.resolve(w.L)
  if (leafletPromise) return leafletPromise
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'
      link.rel = 'stylesheet'
      link.href = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`
      document.head.appendChild(link)
    }
    const script = document.createElement('script')
    script.src = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`
    script.async = true
    script.onload = () => resolve((window as any).L)
    script.onerror = () => reject(new Error('leaflet load failed'))
    document.body.appendChild(script)
  })
  return leafletPromise
}

export function MapView({ events, height = 360 }: MapViewProps) {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const overlayRef = useRef<any>(null) // layerGroup com marcador + trajetória
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  // Inicializa o mapa uma vez.
  useEffect(() => {
    let cancelled = false
    loadLeaflet()
      .then((L) => {
        if (cancelled || !containerRef.current || mapRef.current) return
        const map = L.map(containerRef.current, {
          zoomControl: true,
          attributionControl: true,
        }).setView([0, 0], 2)
        L.tileLayer(`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`, {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map)
        overlayRef.current = L.layerGroup().addTo(map)
        mapRef.current = map
        // o contentor pode ainda não ter o tamanho final
        setTimeout(() => { try { map.invalidateSize() } catch {} }, 0)
        if (!cancelled) setReady(true)
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => {
      cancelled = true
      if (mapRef.current) {
        try { mapRef.current.remove() } catch {}
        mapRef.current = null
        overlayRef.current = null
      }
    }
  }, [])

  // Desenha/atualiza marcador + trajetória sempre que os pontos mudam.
  useEffect(() => {
    if (!ready || !mapRef.current || !overlayRef.current) return
    const w = window as any
    const L = w.L
    if (!L) return
    const layer = overlayRef.current
    layer.clearLayers()
    if (!events.length) return

    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue('--primary').trim() || '#2563eb'

    // Trajetória (do mais antigo ao mais recente)
    const history = events.slice(0, Math.min(events.length, 200)).reverse()
    const latlngs = history.map(e => [e.latitude, e.longitude]) as [number, number][]
    if (latlngs.length > 1) {
      L.polyline(latlngs, { color: accent, weight: 3, opacity: 0.5 }).addTo(layer)
    }

    // Marcador da posição mais recente (ícone CSS — evita problemas de ícone por bundler)
    const latest = events[0]
    const markerIcon = L.divIcon({
      className: '',
      html: `<span style="display:block;width:16px;height:16px;border-radius:9999px;background:${accent};border:2px solid var(--background,#fff);box-shadow:0 0 0 6px color-mix(in srgb, ${accent} 25%, transparent);"></span>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    })
    L.marker([latest.latitude, latest.longitude], { icon: markerIcon })
      .addTo(layer)
      .bindPopup(`${latest.latitude.toFixed(5)}, ${latest.longitude.toFixed(5)}`)

    // Enquadra todos os pontos
    try {
      if (latlngs.length > 1) {
        mapRef.current.fitBounds(latlngs, { padding: [40, 40], maxZoom: 17 })
      } else {
        mapRef.current.setView([latest.latitude, latest.longitude], 16)
      }
    } catch {}
  }, [events, ready])

  if (!events.length) return null
  const latest = events[0]

  return (
    <Card className="border-border/60 shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="font-serif-display text-lg flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          {t('location.current')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative rounded-lg border border-border/40 overflow-hidden" style={{ height: `${height}px` }}>
          <div ref={containerRef} className="absolute inset-0 h-full w-full" style={{ zIndex: 0 }} />
          {failed && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/30 text-xs text-muted-foreground">
              {latest.latitude.toFixed(5)}, {latest.longitude.toFixed(5)}
            </div>
          )}
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
