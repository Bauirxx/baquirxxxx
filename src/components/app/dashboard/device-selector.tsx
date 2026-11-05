'use client'

import { useI18n } from '@/lib/i18n/context'
import { useDevice } from './device-context'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Smartphone, ChevronDown, Circle, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * DeviceSelector — dropdown global no topbar para escolher o dispositivo ativo.
 *
 * Mostra:
 *  - "Todos os dispositivos" (agregado) — deviceId = null
 *  - Lista de dispositivos ativos, com indicador online (● verde) / offline (● cinza)
 *  - Nome do dispositivo + nome da criança (se houver)
 *
 * Ao trocar, atualiza o DeviceContext e TODAS as views reagem automaticamente
 * (useFetch re-busca com o novo deviceId na query string).
 */
export function DeviceSelector() {
  const { t } = useI18n()
  const { activeDevices, selectedDeviceId, selectedDevice, setSelectedDeviceId, loading } = useDevice()

  if (loading && activeDevices.length === 0) {
    return (
      <Button variant="outline" size="sm" disabled className="gap-1.5 h-8">
        <Smartphone className="h-3.5 w-3.5 animate-pulse" />
        <span className="text-xs">{t('device.selector.loading')}</span>
      </Button>
    )
  }

  if (activeDevices.length === 0) {
    return (
      <Button variant="outline" size="sm" disabled className="gap-1.5 h-8">
        <Smartphone className="h-3.5 w-3.5" />
        <span className="text-xs">{t('device.selector.none')}</span>
      </Button>
    )
  }

  const label = selectedDevice
    ? (selectedDevice.childName ? `${selectedDevice.childName}` : selectedDevice.name)
    : t('device.selector.all')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-8 max-w-[180px]">
          <Smartphone className="h-3.5 w-3.5 shrink-0" />
          <span className="text-xs truncate">{label}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs">{t('device.selector.title')}</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Opção "Todos os dispositivos" */}
        <DropdownMenuItem
          onClick={() => setSelectedDeviceId(null)}
          className={cn(
            'gap-2 cursor-pointer',
            selectedDeviceId === null && 'bg-accent'
          )}
        >
          <Layers className="h-4 w-4" />
          <div className="flex flex-col">
            <span className="text-sm">{t('device.selector.all')}</span>
            <span className="text-[10px] text-muted-foreground">
              {t('device.selector.all.desc', { count: activeDevices.length })}
            </span>
          </div>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Lista de dispositivos */}
        {activeDevices.map(d => (
          <DropdownMenuItem
            key={d.id}
            onClick={() => setSelectedDeviceId(d.id)}
            className={cn(
              'gap-2 cursor-pointer',
              selectedDeviceId === d.id && 'bg-accent'
            )}
          >
            <Circle
              className={cn(
                'h-2 w-2 fill-current shrink-0',
                d.online ? 'text-green-500' : 'text-muted-foreground'
              )}
            />
            <div className="flex flex-col min-w-0">
              <span className="text-sm truncate">
                {d.childName ?? d.name}
              </span>
              <span className="text-[10px] text-muted-foreground truncate">
                {d.name} · {d.online ? t('device.selector.online') : t('device.selector.offline')}
              </span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
