'use client'

import { useState, useCallback } from 'react'
import { API_URL } from '@/app/lib/constants'
import { Plugin } from '@/app/lib/types'

interface UsePluginsProps {
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>
  setError?: (error: string | null) => void
}

export function usePlugins({ fetchWithAuth, setError }: UsePluginsProps) {
  const [availablePlugins, setAvailablePlugins] = useState<Plugin[]>([])
  const [installedPlugins, setInstalledPlugins] = useState<Plugin[]>([])
  const [pluginLoading, setPluginLoading] = useState<string | null>(null)

  const fetchAvailablePlugins = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/gameserver/plugins/available`)
      if (res.ok) {
        const data = await res.json()
        setAvailablePlugins(data.plugins || [])
      }
    } catch (err) {
      console.log('Failed to fetch available plugins:', err)
    }
  }, [fetchWithAuth])

  const fetchInstalledPlugins = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/gameserver/plugins`)
      if (res.ok) {
        const data = await res.json()
        setInstalledPlugins(data.plugins || [])
      }
    } catch (err) {
      console.log('Failed to fetch installed plugins:', err)
    }
  }, [fetchWithAuth])

  const fetchPlugins = useCallback(async () => {
    await Promise.all([fetchAvailablePlugins(), fetchInstalledPlugins()])
  }, [fetchAvailablePlugins, fetchInstalledPlugins])

  const installPlugin = useCallback(async (pluginId: string) => {
    setPluginLoading(pluginId)
    try {
      const res = await fetchWithAuth(`${API_URL}/gameserver/plugins/${pluginId}`, {
        method: 'POST'
      })
      if (res.ok) {
        await fetchInstalledPlugins()
      } else {
        const data = await res.json()
        setError?.(data.detail || 'Failed to install plugin')
      }
    } catch (err) {
      console.error('Failed to install plugin:', err)
      setError?.('Failed to install plugin')
    } finally {
      setPluginLoading(null)
    }
  }, [fetchWithAuth, fetchInstalledPlugins, setError])

  const uninstallPlugin = useCallback(async (pluginId: string) => {
    setPluginLoading(pluginId)
    try {
      const res = await fetchWithAuth(`${API_URL}/gameserver/plugins/${pluginId}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        await fetchInstalledPlugins()
      } else {
        const data = await res.json()
        setError?.(data.detail || 'Failed to uninstall plugin')
      }
    } catch (err) {
      console.error('Failed to uninstall plugin:', err)
      setError?.('Failed to uninstall plugin')
    } finally {
      setPluginLoading(null)
    }
  }, [fetchWithAuth, fetchInstalledPlugins, setError])

  const isPluginInstalled = useCallback((pluginId: string): boolean => {
    return installedPlugins.some(p => p.id === pluginId)
  }, [installedPlugins])

  return {
    availablePlugins,
    installedPlugins,
    pluginLoading,
    fetchAvailablePlugins,
    fetchInstalledPlugins,
    fetchPlugins,
    installPlugin,
    uninstallPlugin,
    isPluginInstalled,
  }
}
