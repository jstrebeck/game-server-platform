'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { API_URL } from '@/app/lib/constants'
import { Metrics } from '@/app/lib/types'

interface UseMetricsProps {
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>
}

export function useMetrics({ fetchWithAuth }: UseMetricsProps) {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const metricsIntervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    return () => {
      if (metricsIntervalRef.current) {
        clearInterval(metricsIntervalRef.current)
      }
    }
  }, [])

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/gameserver/metrics`)
      if (res.ok) {
        const data = await res.json()
        if (data.metrics && data.metrics.length > 0) {
          const mcMetrics = data.metrics.find((m: any) => m.container === 'minecraft') || data.metrics[0]
          setMetrics({
            memory_bytes: mcMetrics.memory_bytes,
            memory_human: mcMetrics.memory_human
          })
        } else {
          setMetrics({ memory_bytes: 0, memory_human: 'N/A' })
        }
      } else {
        setMetrics({ memory_bytes: 0, memory_human: 'N/A' })
      }
    } catch (err) {
      console.log('Failed to fetch metrics:', err)
      setMetrics({ memory_bytes: 0, memory_human: 'N/A' })
    }
  }, [fetchWithAuth])

  const startMetricsPolling = useCallback(() => {
    if (metricsIntervalRef.current) {
      clearInterval(metricsIntervalRef.current)
    }
    fetchMetrics()
    metricsIntervalRef.current = setInterval(fetchMetrics, 10000)
  }, [fetchMetrics])

  const stopMetricsPolling = useCallback(() => {
    if (metricsIntervalRef.current) {
      clearInterval(metricsIntervalRef.current)
      metricsIntervalRef.current = null
    }
    setMetrics(null)
  }, [])

  return {
    metrics,
    fetchMetrics,
    startMetricsPolling,
    stopMetricsPolling,
  }
}
