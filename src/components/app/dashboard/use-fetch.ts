'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

// Hook simples para fetch GET com refresh
export function useFetch<T>(url: string | null, opts?: { refreshMs?: number; deps?: any[] }) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const urlRef = useRef(url)
  urlRef.current = url

  const doFetch = useCallback(async () => {
    if (!urlRef.current) {
      setData(null)
      setLoading(false)
      return
    }
    try {
      const res = await fetch(urlRef.current, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
      setError(null)
    } catch (err: any) {
      setError(err.message ?? 'fetch error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    doFetch()
    if (opts?.refreshMs && opts.refreshMs > 0) {
      intervalRef.current = setInterval(doFetch, opts.refreshMs)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...(opts?.deps ?? []), doFetch])

  const refresh = useCallback(() => doFetch(), [doFetch])
  return { data, loading, error, refresh, setData }
}
