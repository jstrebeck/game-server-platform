'use client'

import { useState, useCallback } from 'react'
import { API_URL } from '@/app/lib/constants'
import { Impersonation, ClusterStats, AdminUser, MaintenanceBanner } from '@/app/lib/types'
import { isAdmin } from '@/app/lib/utils'

interface UseAdminProps {
  user: any
  getAccessToken: (forceRefresh?: boolean) => Promise<string | null>
  setError?: (error: string | null) => void
  onImpersonationChange?: () => void
}

export function useAdmin({ user, getAccessToken, setError, onImpersonationChange }: UseAdminProps) {
  const [impersonating, setImpersonating] = useState<Impersonation | null>(null)
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([])
  const [userSearchQuery, setUserSearchQuery] = useState('')
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersTotal, setUsersTotal] = useState(0)
  const [clusterStats, setClusterStats] = useState<ClusterStats | null>(null)
  const [clusterStatsLoading, setClusterStatsLoading] = useState(false)
  const [maintenanceBanner, setMaintenanceBanner] = useState<MaintenanceBanner | null>(null)
  const [maintenanceLoading, setMaintenanceLoading] = useState(false)
  const [maintenanceMessage, setMaintenanceMessage] = useState('')

  const searchUsers = useCallback(async (query: string = '') => {
    if (!isAdmin(user)) return

    setUsersLoading(true)
    try {
      const token = await getAccessToken()
      if (!token) return

      const params = new URLSearchParams()
      if (query) params.set('search', query)
      params.set('per_page', '50')

      const res = await fetch(`${API_URL}/admin/users?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      })

      if (res.ok) {
        const data = await res.json()
        setAdminUsers(data.users || [])
        setUsersTotal(data.total || 0)
      } else {
        console.error('Failed to fetch users:', res.status)
        setError?.('Failed to load users')
      }
    } catch (err) {
      console.error('Error fetching users:', err)
      setError?.('Failed to load users')
    } finally {
      setUsersLoading(false)
    }
  }, [user, getAccessToken, setError])

  const fetchClusterStats = useCallback(async () => {
    if (!isAdmin(user)) return

    setClusterStatsLoading(true)
    try {
      const token = await getAccessToken()
      if (!token) return

      const res = await fetch(`${API_URL}/admin/cluster-stats`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      })

      if (res.ok) {
        const data = await res.json()
        setClusterStats(data)
      } else {
        console.error('Failed to fetch cluster stats:', res.status)
      }
    } catch (err) {
      console.error('Error fetching cluster stats:', err)
    } finally {
      setClusterStatsLoading(false)
    }
  }, [user, getAccessToken])

  const fetchMaintenanceBanner = useCallback(async () => {
    // Public endpoint - no auth required
    try {
      const res = await fetch(`${API_URL}/maintenance`, {
        headers: {
          'Accept': 'application/json',
        },
      })

      if (res.ok) {
        const data = await res.json()
        setMaintenanceBanner(data)
        setMaintenanceMessage(data.message || '')
      } else {
        console.error('Failed to fetch maintenance banner:', res.status)
      }
    } catch (err) {
      console.error('Error fetching maintenance banner:', err)
    }
  }, [])

  const updateMaintenanceBanner = useCallback(async (enabled: boolean, message: string) => {
    if (!isAdmin(user)) return

    setMaintenanceLoading(true)
    try {
      const token = await getAccessToken()
      if (!token) return

      const res = await fetch(`${API_URL}/admin/maintenance`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ enabled, message }),
      })

      if (res.ok) {
        const data = await res.json()
        setMaintenanceBanner(data)
        setMaintenanceMessage(data.message || '')
      } else {
        console.error('Failed to update maintenance banner:', res.status)
        setError?.('Failed to update maintenance banner')
      }
    } catch (err) {
      console.error('Error updating maintenance banner:', err)
      setError?.('Failed to update maintenance banner')
    } finally {
      setMaintenanceLoading(false)
    }
  }, [user, getAccessToken, setError])

  const startImpersonation = useCallback(async (targetUserId: string) => {
    if (!isAdmin(user)) return

    try {
      const token = await getAccessToken()
      if (!token) return

      const res = await fetch(`${API_URL}/admin/impersonate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ user_id: targetUserId }),
      })

      if (res.ok) {
        const data = await res.json()
        setImpersonating({
          userId: data.user_id,
          sanitizedId: data.sanitized_id,
          email: data.email,
        })
        onImpersonationChange?.()
      } else {
        const data = await res.json()
        setError?.(data.detail || 'Failed to impersonate user')
      }
    } catch (err) {
      console.error('Error starting impersonation:', err)
      setError?.('Failed to impersonate user')
    }
  }, [user, getAccessToken, setError, onImpersonationChange])

  const stopImpersonation = useCallback(() => {
    setImpersonating(null)
    onImpersonationChange?.()
  }, [onImpersonationChange])

  return {
    impersonating,
    adminUsers,
    userSearchQuery,
    usersLoading,
    usersTotal,
    clusterStats,
    clusterStatsLoading,
    maintenanceBanner,
    maintenanceLoading,
    maintenanceMessage,
    setMaintenanceMessage,
    setUserSearchQuery,
    searchUsers,
    fetchClusterStats,
    fetchMaintenanceBanner,
    updateMaintenanceBanner,
    startImpersonation,
    stopImpersonation,
  }
}
