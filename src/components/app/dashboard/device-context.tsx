'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { useFetch } from './use-fetch'
import type { DeviceDTO } from '@/lib/types'

/**
 * DeviceContext — fonte única de verdade para o dispositivo selecionado no dashboard.
 *
 * PORQUÊ:
 *  O utilizador pode ter vários telemóveis monitorizados (filho A, filho B, etc.).
 *  Antes, cada view buscava dados de TODOS os dispositivos de uma vez — impossível
 *  saber de que telemóvel vinha cada notificação, foto, chamada, etc.
 *
 *  Agora há um seletor global (no topbar) e TODAS as views consomem este contexto:
 *  - `selectedDeviceId` → deviceId ativo (ou null = "todos")
 *  - `selectedDevice` → o DTO do dispositivo ativo
 *  - `setSelectedDeviceId(id | null)` → trocar de dispositivo
 *  - `devices` → lista completa de dispositivos da conta
 *
 * PERSISTÊNCIA:
 *  O deviceId selecionado é guardado em localStorage (por utilizador) — assim,
 *  ao recarregar a página ou voltar no dia seguinte, o mesmo telemóvel continua
 *  selecionado. Limpo no logout.
 *
 * VALOR null = "TODOS OS DISPOSITIVOS":
 *  Se o utilizador quiser ver dados agregados, pode escolher "Todos" no seletor.
 *  As views que não suportam agregação (ex.: screen-mirror) forçam um dispositivo.
 */

interface DeviceContextValue {
  devices: DeviceDTO[]
  activeDevices: DeviceDTO[]
  selectedDeviceId: string | null
  selectedDevice: DeviceDTO | null
  setSelectedDeviceId: (id: string | null) => void
  loading: boolean
  refresh: () => void
}

const DeviceContext = createContext<DeviceContextValue | null>(null)

const STORAGE_KEY_PREFIX = 'sp_selected_device_'

export function DeviceProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const { data, loading, refresh } = useFetch<{ devices: DeviceDTO[] }>(
    '/api/dashboard/devices',
    { refreshMs: 30000 }
  )

  const devices = data?.devices ?? []
  const activeDevices = devices.filter(d => d.status !== 'revoked')

  const [selectedDeviceId, setSelectedDeviceIdState] = useState<string | null>(null)

  // Carregar deviceId guardado em localStorage ao montar
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_PREFIX + userId)
      if (stored) setSelectedDeviceIdState(stored === '__all__' ? null : stored)
    } catch {}
  }, [userId])

  // Auto-selecionar o primeiro dispositivo ativo se nada estiver selecionado
  // e houver apenas 1 dispositivo (cenário comum: 1 filho = 1 telemóvel)
  useEffect(() => {
    if (selectedDeviceId === null && activeDevices.length === 1) {
      setSelectedDeviceIdState(activeDevices[0].id)
    }
    // Se o deviceId selecionado já não existe (foi revogado/removido), limpar
    if (selectedDeviceId && !activeDevices.find(d => d.id === selectedDeviceId)) {
      setSelectedDeviceIdState(null)
    }
  }, [activeDevices, selectedDeviceId])

  const setSelectedDeviceId = useCallback((id: string | null) => {
    setSelectedDeviceIdState(id)
    try {
      localStorage.setItem(STORAGE_KEY_PREFIX + userId, id ?? '__all__')
    } catch {}
  }, [userId])

  const selectedDevice = selectedDeviceId
    ? activeDevices.find(d => d.id === selectedDeviceId) ?? null
    : null

  return (
    <DeviceContext.Provider value={{
      devices,
      activeDevices,
      selectedDeviceId,
      selectedDevice,
      setSelectedDeviceId,
      loading,
      refresh,
    }}>
      {children}
    </DeviceContext.Provider>
  )
}

export function useDevice(): DeviceContextValue {
  const ctx = useContext(DeviceContext)
  if (!ctx) {
    throw new Error('useDevice deve ser usado dentro de <DeviceProvider>')
  }
  return ctx
}
