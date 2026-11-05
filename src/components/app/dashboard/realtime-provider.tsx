'use client'

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { subscribeRealtime, type RealtimeEvent } from '@/lib/realtime'

interface RealtimeContextValue {
  events: RealtimeEvent[]
  connected: boolean
  push: (event: RealtimeEvent) => void
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null)

export function RealtimeProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [connected, setConnected] = useState(false)
  const [events, setEvents] = useState<RealtimeEvent[]>([])

  const push = useCallback((event: RealtimeEvent) => {
    setEvents(prev => [event, ...prev].slice(0, 200))
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeRealtime(userId, {
      onEvent: (event) => setEvents(prev => [event, ...prev].slice(0, 200)),
      onConnect: () => setConnected(true),
      onDisconnect: () => setConnected(false),
    })
    return unsubscribe
  }, [userId])

  return (
    <RealtimeContext.Provider value={{ events, connected, push }}>
      {children}
    </RealtimeContext.Provider>
  )
}

export function useRealtime() {
  const ctx = useContext(RealtimeContext)
  if (!ctx) throw new Error('useRealtime must be used within RealtimeProvider')
  return ctx
}
