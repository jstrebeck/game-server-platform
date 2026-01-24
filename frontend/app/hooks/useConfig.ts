'use client'

import { useState, useCallback, useMemo } from 'react'
import { API_URL } from '@/app/lib/constants'
import { ConfigFile } from '@/app/lib/types'

interface UseConfigProps {
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>
}

interface SaveMessage {
  type: 'success' | 'error'
  text: string
}

export function useConfig({ fetchWithAuth }: UseConfigProps) {
  const [files, setFiles] = useState<ConfigFile[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string>('')
  const [originalContent, setOriginalContent] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<SaveMessage | null>(null)

  const hasUnsavedChanges = useMemo(() => {
    return fileContent !== originalContent
  }, [fileContent, originalContent])

  const fetchConfigFiles = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetchWithAuth(`${API_URL}/gameserver/config`)

      if (res.ok) {
        const data = await res.json()
        setFiles(data.files || [])
      } else {
        const data = await res.json()
        setError(data.detail || 'Failed to load config files')
        setFiles([])
      }
    } catch (err) {
      console.error('Failed to fetch config files:', err)
      setError('Failed to fetch config files')
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [fetchWithAuth])

  const loadFile = useCallback(async (filename: string) => {
    setLoading(true)
    setError(null)
    setSaveMessage(null)

    try {
      const res = await fetchWithAuth(`${API_URL}/gameserver/config/${encodeURIComponent(filename)}`)

      if (res.ok) {
        const data = await res.json()
        setSelectedFile(filename)
        setFileContent(data.content || '')
        setOriginalContent(data.content || '')
      } else {
        const data = await res.json()
        setError(data.detail || 'Failed to load file')
      }
    } catch (err) {
      console.error('Failed to load config file:', err)
      setError('Failed to load file')
    } finally {
      setLoading(false)
    }
  }, [fetchWithAuth])

  const saveFile = useCallback(async () => {
    if (!selectedFile) return

    setSaving(true)
    setSaveMessage(null)
    setError(null)

    try {
      const res = await fetchWithAuth(`${API_URL}/gameserver/config/${encodeURIComponent(selectedFile)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: fileContent }),
      })

      const data = await res.json()

      if (res.ok) {
        setOriginalContent(fileContent)
        setSaveMessage({ type: 'success', text: data.message || 'File saved successfully' })
      } else {
        setSaveMessage({ type: 'error', text: data.detail || 'Failed to save file' })
      }
    } catch (err) {
      console.error('Failed to save config file:', err)
      setSaveMessage({ type: 'error', text: 'Failed to save file' })
    } finally {
      setSaving(false)
    }
  }, [fetchWithAuth, selectedFile, fileContent])

  const resetConfig = useCallback(() => {
    setFiles([])
    setSelectedFile(null)
    setFileContent('')
    setOriginalContent('')
    setError(null)
    setSaveMessage(null)
  }, [])

  const getLanguageFromFilename = useCallback((filename: string): string => {
    if (filename.endsWith('.yml') || filename.endsWith('.yaml')) {
      return 'yaml'
    }
    if (filename.endsWith('.json')) {
      return 'json'
    }
    if (filename.endsWith('.properties')) {
      return 'ini'
    }
    return 'plaintext'
  }, [])

  return {
    files,
    selectedFile,
    fileContent,
    originalContent,
    loading,
    saving,
    error,
    saveMessage,
    hasUnsavedChanges,
    setFileContent,
    setSelectedFile,
    setSaveMessage,
    fetchConfigFiles,
    loadFile,
    saveFile,
    resetConfig,
    getLanguageFromFilename,
  }
}
