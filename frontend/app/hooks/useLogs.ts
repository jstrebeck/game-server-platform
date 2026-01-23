'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { API_URL, WS_URL } from '@/app/lib/constants'
import { Impersonation } from '@/app/lib/types'

interface UseLogsProps {
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>
  getAccessToken: (forceRefresh?: boolean) => Promise<string | null>
  userId: string
  impersonating: Impersonation | null
  setError?: (error: string | null) => void
}

export function useLogs({ fetchWithAuth, getAccessToken, userId, impersonating, setError }: UseLogsProps) {
  const [logs, setLogs] = useState<string[]>([])
  const [wsConnected, setWsConnected] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (showLogs) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, showLogs])

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  const connectToLogs = useCallback(async (namespace: string, podName: string) => {
    if (wsRef.current) {
      wsRef.current.close()
    }

    const token = await getAccessToken()
    if (!token) {
      setError?.('Authentication required for log streaming')
      return
    }

    setLogs([])
    setShowLogs(true)

    let wsUrl = `${WS_URL}/ws/logs/${namespace}/${podName}?token=${encodeURIComponent(token)}`
    if (impersonating) {
      wsUrl += `&impersonate=${encodeURIComponent(impersonating.userId)}`
    }
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      console.log('WebSocket connected')
      setWsConnected(true)
    }

    ws.onmessage = (event) => {
      setLogs(prev => [...prev, event.data])
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
      setWsConnected(false)
    }

    ws.onclose = () => {
      console.log('WebSocket closed')
      setWsConnected(false)
    }

    wsRef.current = ws
  }, [getAccessToken, impersonating, setError])

  const disconnectLogs = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setWsConnected(false)
    setShowLogs(false)
  }, [])

  const fetchPodsAndConnect = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/gameserver/pods`)
      if (!res.ok) {
        throw new Error(`Failed to fetch pods: ${res.status}`)
      }

      const data = await res.json()

      if (data.pods && data.pods.length > 0) {
        const podName = data.pods[0].name
        const effectiveUserId = impersonating ? impersonating.sanitizedId : userId
        const namespace = `server-${effectiveUserId}`
        connectToLogs(namespace, podName)
      } else {
        alert('No pods found. The server might still be starting up.')
      }
    } catch (error) {
      console.error('Error fetching pods:', error)
      alert('Failed to fetch pod information. Please try again.')
    }
  }, [fetchWithAuth, impersonating, userId, connectToLogs])

  return {
    logs,
    wsConnected,
    showLogs,
    logsEndRef,
    setShowLogs,
    connectToLogs,
    disconnectLogs,
    fetchPodsAndConnect,
  }
}
