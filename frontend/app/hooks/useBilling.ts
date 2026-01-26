'use client'

import { useState, useCallback } from 'react'
import { API_URL, AVAILABLE_PLANS } from '@/app/lib/constants'
import { BillingStatus } from '@/app/lib/types'

interface UseBillingProps {
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>
  setError?: (error: string | null) => void
}

export function useBilling({ fetchWithAuth, setError }: UseBillingProps) {
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null)
  const [billingLoading, setBillingLoading] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showCapacityModal, setShowCapacityModal] = useState(false)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [upgradeSuccess, setUpgradeSuccess] = useState<string | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<string>('2gb')

  const fetchBillingStatus = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/billing/status`)
      if (res.ok) {
        const data = await res.json()
        setBillingStatus(data)
      }
    } catch (err) {
      console.error('Error fetching billing status:', err)
    }
  }, [fetchWithAuth])

  const handleSubscribe = useCallback(async (planId: string = selectedPlan, referralCode?: string) => {
    setBillingLoading(true)
    setPaymentError(null)
    try {
      const body: { plan_id: string; referral_code?: string } = { plan_id: planId }
      if (referralCode) {
        body.referral_code = referralCode.trim().toUpperCase()
      }

      const res = await fetchWithAuth(`${API_URL}/billing/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const data = await res.json()
        window.location.href = data.checkout_url
      } else if (res.status === 503) {
        setShowCapacityModal(true)
      } else {
        const data = await res.json()
        setPaymentError(data.detail || 'Failed to create checkout session')
      }
    } catch (err) {
      console.error('Error creating checkout:', err)
      setPaymentError('Failed to create checkout session. Please try again.')
    } finally {
      setBillingLoading(false)
    }
  }, [fetchWithAuth, selectedPlan])

  const handleManageSubscription = useCallback(async () => {
    setBillingLoading(true)
    try {
      const res = await fetchWithAuth(`${API_URL}/billing/portal`, {
        method: 'POST',
      })
      if (res.ok) {
        const data = await res.json()
        window.open(data.portal_url, '_blank')
      } else {
        const data = await res.json()
        setError?.(data.detail || 'Failed to open billing portal')
      }
    } catch (err) {
      console.error('Error opening portal:', err)
      setError?.('Failed to open billing portal. Please try again.')
    } finally {
      setBillingLoading(false)
    }
  }, [fetchWithAuth, setError])

  const handleUpgrade = useCallback(async () => {
    setBillingLoading(true)
    setPaymentError(null)
    setUpgradeSuccess(null)
    try {
      const res = await fetchWithAuth(`${API_URL}/billing/upgrade`, {
        method: 'POST',
      })
      if (res.ok) {
        const data = await res.json()
        await fetchBillingStatus()
        setUpgradeSuccess(data.message)
        setTimeout(() => setUpgradeSuccess(null), 5000)
      } else if (res.status === 503) {
        setShowCapacityModal(true)
      } else {
        const data = await res.json()
        setPaymentError(data.detail || 'Failed to upgrade subscription')
      }
    } catch (err) {
      console.error('Error upgrading:', err)
      setPaymentError('Failed to upgrade subscription. Please try again.')
    } finally {
      setBillingLoading(false)
    }
  }, [fetchWithAuth, fetchBillingStatus])

  const getNextPlan = useCallback((currentPlanId: string | null) => {
    const planOrder = ['2gb', '4gb', '6gb', '8gb']
    const currentIndex = planOrder.indexOf(currentPlanId || '2gb')
    if (currentIndex >= 0 && currentIndex < planOrder.length - 1) {
      const nextPlanId = planOrder[currentIndex + 1]
      return AVAILABLE_PLANS.find(p => p.plan_id === nextPlanId) || null
    }
    return null
  }, [])

  const getCurrentPlan = useCallback((currentPlanId: string | null) => {
    return AVAILABLE_PLANS.find(p => p.plan_id === (currentPlanId || '2gb')) || null
  }, [])

  return {
    billingStatus,
    billingLoading,
    showPaymentModal,
    showCapacityModal,
    showUpgradeModal,
    paymentError,
    upgradeSuccess,
    selectedPlan,
    setShowPaymentModal,
    setShowCapacityModal,
    setShowUpgradeModal,
    setPaymentError,
    setSelectedPlan,
    fetchBillingStatus,
    handleSubscribe,
    handleManageSubscription,
    handleUpgrade,
    getNextPlan,
    getCurrentPlan,
  }
}
