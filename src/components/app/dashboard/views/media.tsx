'use client'

import { useState } from 'react'
import { useI18n } from '@/lib/i18n/context'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '../components/empty-state'
import { useFetch } from '../use-fetch'
import { useDevice } from '../device-context'
import {
  Image as ImageIcon,
  Video,
  Music,
  AlertTriangle,
  Filter,
} from 'lucide-react'

const TYPE_ICONS: Record<string, any> = {
  photo: ImageIcon,
  video: Video,
  audio: Music,
}

const TYPE_COLORS: Record<string, string> = {
  photo: 'text-blue-500',
  video: 'text-purple-500',
  audio: 'text-green-500',
}

interface MediaDTO {
  id: string
  deviceId: string
  type: string
  fileName: string
  mimeType: string
  sizeBytes: number
  thumbnail: string | null
  flagged: boolean
  flagReason: string | null
  source: string | null
  timestamp: string
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function MediaView() {
  const { t, locale } = useI18n()
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  const { selectedDeviceId, activeDevices } = useDevice()

  const { data, loading } = useFetch<{ media: MediaDTO[] }>(
    `/api/dashboard/media?limit=200${selectedType ? `&type=${selectedType}` : ''}${flaggedOnly ? '&flagged=true' : ''}${selectedDeviceId ? `&deviceId=${selectedDeviceId}` : ''}`,
    { refreshMs: 30000, deps: [selectedType, flaggedOnly, selectedDeviceId] }
  )

  const media = data?.media ?? []

  if (loading && !data) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {[...Array(12)].map((_, i) => <Skeleton key={i} className="aspect-square w-full" />)}
      </div>
    )
  }

  if (media.length === 0) {
    const deviceLabel = selectedDeviceId
      ? (activeDevices.find(d => d.id === selectedDeviceId)?.childName ?? activeDevices.find(d => d.id === selectedDeviceId)?.name ?? 'este dispositivo')
      : 'todos os dispositivos'
    return (
      <EmptyState
        icon={ImageIcon}
        title="Sem ficheiros de mídia"
        body={`A mostrar dados de ${deviceLabel}. Fotos, vídeos e áudios do telemóvel aparecem aqui quando a app Companion estiver ativa com permissão de armazenamento.`}
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={flaggedOnly ? 'default' : 'outline'} onClick={() => setFlaggedOnly(!flaggedOnly)} className="gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" />
          {flaggedOnly ? 'Sinalizados' : 'Todos'}
        </Button>
        {['photo', 'video', 'audio'].map(tp => (
          <Button key={tp} size="sm" variant={selectedType === tp ? 'default' : 'outline'} onClick={() => setSelectedType(selectedType === tp ? null : tp)} className="capitalize gap-1.5">
            {(() => { const Icon = TYPE_ICONS[tp]; return <Icon className="h-3.5 w-3.5" /> })()}
            {tp === 'photo' ? 'Fotos' : tp === 'video' ? 'Vídeos' : 'Áudios'}
          </Button>
        ))}
      </div>

      {/* Galeria */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {media.map(m => {
          const Icon = TYPE_ICONS[m.type] ?? ImageIcon
          return (
            <Card key={m.id} className={`border-border/60 shadow-none overflow-hidden ${m.flagged ? 'border-l-4 border-l-red-500' : ''}`}>
              <div className="aspect-square bg-muted/30 flex items-center justify-center relative">
                {m.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.thumbnail} alt={m.fileName} className="w-full h-full object-cover" />
                ) : (
                  <Icon className={`h-8 w-8 ${TYPE_COLORS[m.type] ?? 'text-gray-400'}`} />
                )}
                {m.flagged && (
                  <div className="absolute top-1 right-1">
                    <Badge className="text-[9px] bg-red-600 text-white">
                      <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                      {m.flagReason ?? 'flag'}
                    </Badge>
                  </div>
                )}
                <div className="absolute bottom-1 left-1">
                  <Badge variant="secondary" className="text-[9px] capitalize">
                    {m.source ?? m.type}
                  </Badge>
                </div>
              </div>
              <CardContent className="p-2">
                <div className="text-[10px] text-muted-foreground truncate">{m.fileName}</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[9px] text-muted-foreground">{formatSize(m.sizeBytes)}</span>
                  <span className="text-[9px] text-muted-foreground font-mono">
                    {new Date(m.timestamp).toLocaleDateString(locale)}
                  </span>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
