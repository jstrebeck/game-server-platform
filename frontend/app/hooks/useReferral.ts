'use client'

import { useState, useCallback } from 'react'
import { API_URL } from '@/app/lib/constants'
import { ReferralCodeResponse, ReferralValidateResponse } from '@/app/lib/types'

interface UseReferralProps {
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>
}

export function useReferral({ fetchWithAuth }: UseReferralProps) {
  const [referralData, setReferralData] = useState<ReferralCodeResponse | null>(null)
  const [referralLoading, setReferralLoading] = useState(false)
  const [referralError, setReferralError] = useState<string | null>(null)
  const [validationResult, setValidationResult] = useState<ReferralValidateResponse | null>(null)
  const [validating, setValidating] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)

  const fetchReferralCode = useCallback(async () => {
    setReferralLoading(true)
    setReferralError(null)
    try {
      const res = await fetchWithAuth(`${API_URL}/referral/code`)
      if (res.ok) {
        const data = await res.json()
        setReferralData(data)
      } else {
        const errData = await res.json()
        setReferralError(errData.detail || 'Failed to fetch referral code')
      }
    } catch (err) {
      console.error('Error fetching referral code:', err)
      setReferralError('Failed to fetch referral code')
    } finally {
      setReferralLoading(false)
    }
  }, [fetchWithAuth])

  const validateReferralCode = useCallback(async (code: string): Promise<ReferralValidateResponse | null> => {
    if (!code.trim()) {
      setValidationResult(null)
      return null
    }

    setValidating(true)
    setValidationResult(null)
    try {
      const res = await fetchWithAuth(`${API_URL}/referral/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: code.trim().toUpperCase() }),
      })

      const data = await res.json()

      if (res.ok) {
        setValidationResult(data)
        return data
      } else {
        const errorResult: ReferralValidateResponse = {
          valid: false,
          message: data.detail || 'Failed to validate code',
          referrer_id: null
        }
        setValidationResult(errorResult)
        return errorResult
      }
    } catch (err) {
      console.error('Error validating referral code:', err)
      const errorResult: ReferralValidateResponse = {
        valid: false,
        message: 'Failed to validate code',
        referrer_id: null
      }
      setValidationResult(errorResult)
      return errorResult
    } finally {
      setValidating(false)
    }
  }, [fetchWithAuth])

  const copyReferralCode = useCallback(async () => {
    if (!referralData?.referral_code) return

    try {
      await navigator.clipboard.writeText(referralData.referral_code)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [referralData])

  const copyShareLink = useCallback(async () => {
    if (!referralData?.share_url) return

    try {
      await navigator.clipboard.writeText(referralData.share_url)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [referralData])

  const clearValidation = useCallback(() => {
    setValidationResult(null)
  }, [])

  const formatCredits = useCallback((cents: number): string => {
    return `$${(cents / 100).toFixed(2)}`
  }, [])

  return {
    referralData,
    referralLoading,
    referralError,
    validationResult,
    validating,
    copySuccess,
    fetchReferralCode,
    validateReferralCode,
    copyReferralCode,
    copyShareLink,
    clearValidation,
    formatCredits,
  }
}
