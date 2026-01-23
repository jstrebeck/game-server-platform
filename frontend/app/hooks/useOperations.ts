'use client'

import { useState, useRef, useCallback } from 'react'
import { API_URL } from '@/app/lib/constants'
import { UploadMessage } from '@/app/lib/types'

interface UseOperationsProps {
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>
  getAccessToken: (forceRefresh?: boolean) => Promise<string | null>
}

export function useOperations({ fetchWithAuth, getAccessToken }: UseOperationsProps) {
  const [opPlayerName, setOpPlayerName] = useState('')
  const [opLoading, setOpLoading] = useState(false)
  const [opMessage, setOpMessage] = useState<string | null>(null)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [uploadMessage, setUploadMessage] = useState<UploadMessage | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const opPlayer = useCallback(async () => {
    if (!opPlayerName.trim()) return

    setOpLoading(true)
    setOpMessage(null)
    try {
      const res = await fetchWithAuth(`${API_URL}/gameserver/op/${encodeURIComponent(opPlayerName.trim())}`, {
        method: 'POST'
      })
      const data = await res.json()
      if (res.ok) {
        setOpMessage(`Successfully opped ${opPlayerName}`)
        setOpPlayerName('')
      } else {
        setOpMessage(data.detail || 'Failed to op player')
      }
    } catch (err) {
      console.error('Failed to op player:', err)
      setOpMessage('Failed to op player')
    } finally {
      setOpLoading(false)
      setTimeout(() => setOpMessage(null), 5000)
    }
  }, [fetchWithAuth, opPlayerName])

  const uploadWorld = useCallback(async (file: File) => {
    setUploadLoading(true)
    setUploadMessage(null)

    try {
      const token = await getAccessToken()
      if (!token) {
        setUploadMessage({ type: 'error', text: 'Authentication required' })
        return
      }

      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(`${API_URL}/gameserver/world/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      })

      const data = await res.json()

      if (res.ok) {
        setUploadMessage({ type: 'success', text: data.message || 'World uploaded successfully! Start your server to play.' })
      } else {
        setUploadMessage({ type: 'error', text: data.detail || 'Failed to upload world' })
      }
    } catch (err) {
      console.error('Failed to upload world:', err)
      setUploadMessage({ type: 'error', text: 'Failed to upload world. Please try again.' })
    } finally {
      setUploadLoading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }, [getAccessToken])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.zip')) {
      setUploadMessage({ type: 'error', text: 'Please select a .zip file' })
      return
    }

    const maxSize = 500 * 1024 * 1024
    if (file.size > maxSize) {
      setUploadMessage({ type: 'error', text: 'File too large. Maximum size is 500MB.' })
      return
    }

    uploadWorld(file)
  }, [uploadWorld])

  return {
    opPlayerName,
    opLoading,
    opMessage,
    uploadLoading,
    uploadMessage,
    fileInputRef,
    setOpPlayerName,
    setUploadMessage,
    opPlayer,
    handleFileSelect,
  }
}
