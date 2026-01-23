'use client'

import { useCallback } from 'react'
import { useAccessToken } from '@/components/AccessTokenProvider'
import { API_URL } from '@/app/lib/constants'
import { isTokenExpired } from '@/app/lib/utils'
import { Impersonation } from '@/app/lib/types'

export function useAuth(impersonating: Impersonation | null) {
  const { getAccessToken } = useAccessToken()

  const fetchWithAuth = useCallback(async (url: string, options: RequestInit = {}) => {
    let token = await getAccessToken()

    if (!token) {
      window.location.href = '/auth/login'
      throw new Error('Not authenticated')
    }

    if (isTokenExpired(token)) {
      console.log('Token expired, requesting fresh token...')
      token = await getAccessToken(true)

      if (!token || isTokenExpired(token)) {
        console.log('Could not refresh token, redirecting to login...')
        window.location.href = '/auth/login'
        throw new Error('Session expired')
      }
    }

    const headers: Record<string, string> = {
      ...options.headers as Record<string, string>,
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    }

    if (impersonating) {
      headers['X-Impersonate-User'] = impersonating.userId
    }

    return fetch(url, {
      ...options,
      headers,
    })
  }, [getAccessToken, impersonating])

  return { fetchWithAuth, getAccessToken }
}
