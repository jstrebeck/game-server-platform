'use client'

import { useState, useEffect } from 'react'

interface UseTermsProps {
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>
  userLoaded: boolean
}

interface TermsStatus {
  accepted: boolean
  accepted_at: string | null
  version: string | null
}

export function useTerms({ fetchWithAuth, userLoaded }: UseTermsProps) {
  const [termsAccepted, setTermsAccepted] = useState<boolean | null>(null)
  const [termsLoading, setTermsLoading] = useState(false)
  const [termsError, setTermsError] = useState<string | null>(null)
  const [checkingTerms, setCheckingTerms] = useState(true)

  // Check terms acceptance status on load
  useEffect(() => {
    if (!userLoaded) return

    const checkTermsStatus = async () => {
      setCheckingTerms(true)
      try {
        const res = await fetchWithAuth(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/user/terms-status`
        )

        if (res.ok) {
          const data: TermsStatus = await res.json()
          setTermsAccepted(data.accepted)
        } else {
          // If endpoint doesn't exist or returns error, assume terms not accepted
          setTermsAccepted(false)
        }
      } catch (err) {
        console.error('Error checking terms status:', err)
        // On error, assume terms not accepted to be safe
        setTermsAccepted(false)
      } finally {
        setCheckingTerms(false)
      }
    }

    checkTermsStatus()
  }, [userLoaded, fetchWithAuth])

  const acceptTerms = async () => {
    setTermsLoading(true)
    setTermsError(null)

    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/user/accept-terms`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      )

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Failed to accept terms')
      }

      setTermsAccepted(true)
    } catch (err) {
      setTermsError(err instanceof Error ? err.message : 'Failed to accept terms')
      throw err
    } finally {
      setTermsLoading(false)
    }
  }

  return {
    termsAccepted,
    termsLoading,
    termsError,
    checkingTerms,
    acceptTerms,
    setTermsError,
  }
}
