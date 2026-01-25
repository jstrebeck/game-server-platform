'use client'

import { useState, useCallback } from 'react'
import { API_URL } from '@/app/lib/constants'
import { ServerResult } from '@/app/lib/types'

interface UseServerProps {
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>
  onServerReady?: () => void
  onServerStopped?: () => void
  fetchPlugins?: () => void
  fetchBillingStatus?: () => void
  setShowPaymentModal?: (show: boolean) => void
  setPaymentError?: (error: string | null) => void
}

export function useServer({
  fetchWithAuth,
  onServerReady,
  onServerStopped,
  fetchPlugins,
  fetchBillingStatus,
  setShowPaymentModal,
  setPaymentError,
}: UseServerProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ServerResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [serverExists, setServerExists] = useState<boolean | null>(null)

  const getExistingServer = useCallback(async () => {
    setLoading(true)
    setResult(null)
    setError(null)
    onServerStopped?.()

    try {
      const res = await fetchWithAuth(`${API_URL}/gameserver`)

      if (!res.ok) {
        if (res.status === 404) {
          setServerExists(false)
          setError('No server found. Create a new server to get started.')
        } else if (res.status === 401) {
          setError('Authentication expired. Please log in again.')
        } else {
          setError(`Failed to fetch server info (Error ${res.status}). Please try again.`)
        }
        setLoading(false)
        return
      }

      const data = await res.json()
      setResult(data)
      setServerExists(true)
      setError(null)

      if (data.status === 'ready') {
        onServerReady?.()
      }
      fetchPlugins?.()
    } catch (err) {
      console.error('Error fetching server:', err)
      setError('Failed to connect to backend. Please ensure the backend server is running.')
    } finally {
      setLoading(false)
    }
  }, [fetchWithAuth, onServerReady, onServerStopped, fetchPlugins])

  const createServer = useCallback(async (selectedVersion: string) => {
    setLoading(true)
    setResult(null)
    setError(null)
    onServerStopped?.()

    try {
      const res = await fetchWithAuth(
        `${API_URL}/gameserver?game=minecraft&version=${selectedVersion}`,
        { method: 'POST' }
      )

      if (!res.ok) {
        if (res.status === 409) {
          setServerExists(true)
          setError('Server already exists.')
          await getExistingServer()
        } else if (res.status === 500) {
          setError('Server error occurred. Please try again later.')
        } else if (res.status === 401) {
          setError('Authentication expired. Please log in again.')
        } else {
          setError(`Failed to create server (Error ${res.status}). Please try again.`)
        }
        setLoading(false)
        return
      }

      const data = await res.json()
      setResult(data)
      setServerExists(true)
      setError(null)

      if (data.status === 'ready') {
        onServerReady?.()
      }
    } catch (err) {
      console.error('Error creating server:', err)
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [fetchWithAuth, getExistingServer, onServerReady, onServerStopped])

  const startServer = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetchWithAuth(`${API_URL}/gameserver/start`, {
        method: 'POST',
      })

      if (!res.ok) {
        if (res.status === 402) {
          const data = await res.json()
          setPaymentError?.(data.detail?.message || 'Subscription required to start server')
          setShowPaymentModal?.(true)
          fetchBillingStatus?.()
        } else {
          setError(`Failed to start server (Error ${res.status})`)
        }
        return
      }

      await getExistingServer()
    } catch (err) {
      console.error('Error starting server:', err)
      setError('Failed to start server. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [fetchWithAuth, getExistingServer, fetchBillingStatus, setShowPaymentModal, setPaymentError])

  const stopServer = useCallback(async () => {
    setLoading(true)
    setError(null)
    onServerStopped?.()

    try {
      const res = await fetchWithAuth(`${API_URL}/gameserver/stop`, {
        method: 'POST',
      })

      if (!res.ok) {
        setError(`Failed to stop server (Error ${res.status})`)
        return
      }

      await getExistingServer()
    } catch (err) {
      console.error('Error stopping server:', err)
      setError('Failed to stop server. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [fetchWithAuth, getExistingServer, onServerStopped])

  const restartServer = useCallback(async () => {
    setLoading(true)
    setError(null)
    onServerStopped?.()

    try {
      const stopRes = await fetchWithAuth(`${API_URL}/gameserver/stop`, {
        method: 'POST',
      })

      if (!stopRes.ok) {
        setError(`Failed to restart server (Error ${stopRes.status})`)
        return
      }

      const startRes = await fetchWithAuth(`${API_URL}/gameserver/start`, {
        method: 'POST',
      })

      if (!startRes.ok) {
        if (startRes.status === 402) {
          const data = await startRes.json()
          setPaymentError?.(data.detail?.message || 'Subscription required to start server')
          setShowPaymentModal?.(true)
          fetchBillingStatus?.()
        } else {
          setError(`Failed to restart server (Error ${startRes.status})`)
        }
        return
      }

      await getExistingServer()
    } catch (err) {
      console.error('Error restarting server:', err)
      setError('Failed to restart server. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [fetchWithAuth, getExistingServer, onServerStopped, fetchBillingStatus, setShowPaymentModal, setPaymentError])

  const deleteServer = useCallback(async () => {
    if (!confirm('Are you sure you want to delete your server? This action cannot be undone.')) {
      return
    }

    setLoading(true)
    setError(null)
    onServerStopped?.()

    try {
      const res = await fetchWithAuth(`${API_URL}/gameserver`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        setError(`Failed to delete server (Error ${res.status})`)
        return
      }

      setResult(null)
      setServerExists(false)
      setError(null)
    } catch (err) {
      console.error('Error deleting server:', err)
      setError('Failed to delete server. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [fetchWithAuth, onServerStopped])

  const resetServerState = useCallback(() => {
    setResult(null)
    setServerExists(null)
  }, [])

  return {
    loading,
    result,
    error,
    serverExists,
    setError,
    setResult,
    setServerExists,
    getExistingServer,
    createServer,
    startServer,
    stopServer,
    restartServer,
    deleteServer,
    resetServerState,
  }
}
