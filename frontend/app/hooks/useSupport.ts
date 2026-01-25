'use client'

import { useState } from 'react'

interface UseSupportProps {
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>
}

export function useSupport({ fetchWithAuth }: UseSupportProps) {
  const [supportLoading, setSupportLoading] = useState(false)
  const [supportMessage, setSupportMessage] = useState<string | null>(null)
  const [supportError, setSupportError] = useState<string | null>(null)
  const [showSupportModal, setShowSupportModal] = useState(false)

  const submitSupportRequest = async (subject: string, message: string, userEmail?: string) => {
    setSupportLoading(true)
    setSupportError(null)
    setSupportMessage(null)

    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/support`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject, message, user_email: userEmail }),
        }
      )

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Failed to submit support request')
      }

      setSupportMessage('Your support request has been submitted. We will get back to you soon!')
      return true
    } catch (err) {
      setSupportError(err instanceof Error ? err.message : 'Failed to submit support request')
      return false
    } finally {
      setSupportLoading(false)
    }
  }

  return {
    supportLoading,
    supportMessage,
    supportError,
    showSupportModal,
    setShowSupportModal,
    setSupportMessage,
    setSupportError,
    submitSupportRequest,
  }
}
