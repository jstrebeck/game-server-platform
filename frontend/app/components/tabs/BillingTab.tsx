'use client'

import { useState, useEffect } from 'react'
import { BillingStatus, Plan, ReferralCodeResponse, ReferralValidateResponse } from '@/app/lib/types'
import { AVAILABLE_PLANS } from '@/app/lib/constants'

interface BillingTabProps {
  billingStatus: BillingStatus | null
  billingLoading: boolean
  selectedPlan: string
  upgradeSuccess: string | null
  isImpersonating: boolean
  onSelectPlan: (planId: string) => void
  onSubscribe: (planId: string, referralCode?: string) => void
  onManageSubscription: () => void
  onShowUpgradeModal: () => void
  getNextPlan: (planId: string | null) => Plan | null
  // Referral props
  referralData: ReferralCodeResponse | null
  referralLoading: boolean
  validationResult: ReferralValidateResponse | null
  validating: boolean
  copySuccess: boolean
  onCopyCode: () => void
  onValidateCode: (code: string) => void
  onClearValidation: () => void
  initialReferralCode?: string
}

export function BillingTab({
  billingStatus,
  billingLoading,
  selectedPlan,
  upgradeSuccess,
  isImpersonating,
  onSelectPlan,
  onSubscribe,
  onManageSubscription,
  onShowUpgradeModal,
  getNextPlan,
  referralData,
  referralLoading,
  validationResult,
  validating,
  copySuccess,
  onCopyCode,
  onValidateCode,
  onClearValidation,
  initialReferralCode,
}: BillingTabProps) {
  const [referralCodeInput, setReferralCodeInput] = useState(initialReferralCode || '')

  // Update input when initialReferralCode changes (e.g., from URL param)
  useEffect(() => {
    if (initialReferralCode && !referralCodeInput) {
      setReferralCodeInput(initialReferralCode)
      // Auto-validate if we have an initial code
      onValidateCode(initialReferralCode)
    }
  }, [initialReferralCode])

  const showSubscribeOptions = billingStatus && (
    billingStatus.subscription_status === 'none' ||
    billingStatus.subscription_status === 'trialing' ||
    billingStatus.subscription_status === 'canceled' ||
    billingStatus.is_trial_expired
  )

  const handleSubscribeClick = () => {
    const codeToUse = validationResult?.valid ? referralCodeInput.trim().toUpperCase() : undefined
    onSubscribe(selectedPlan, codeToUse)
  }

  const handleValidateCode = () => {
    if (referralCodeInput.trim()) {
      onValidateCode(referralCodeInput.trim().toUpperCase())
    }
  }

  const formatCredits = (cents: number): string => {
    return `$${(cents / 100).toFixed(2)}`
  }

  return (
    <div className="space-y-4 mb-4">
      {/* Impersonation Notice */}
      {isImpersonating && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-2">
          <svg className="w-5 h-5 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-amber-200 text-sm">Billing actions are disabled while impersonating a user.</p>
        </div>
      )}

      {/* Current Plan Status */}
      <div className="p-4 bg-slate-800/50 rounded-lg">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
          <span className="text-white font-medium">Subscription Status</span>
        </div>

        {billingStatus ? (
          <div className="space-y-3">
            {/* Status Badge and Current Plan */}
            <div className="flex items-center justify-between">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                billingStatus.subscription_status === 'active'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : billingStatus.subscription_status === 'trialing'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : billingStatus.subscription_status === 'past_due'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : billingStatus.subscription_status === 'canceled'
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'
              }`}>
                {billingStatus.subscription_status === 'active' && 'Active Subscription'}
                {billingStatus.subscription_status === 'trialing' && 'Free Trial'}
                {billingStatus.subscription_status === 'past_due' && 'Payment Due'}
                {billingStatus.subscription_status === 'canceled' && 'Canceled'}
                {billingStatus.subscription_status === 'none' && 'No Subscription'}
              </span>
              {billingStatus.memory && (
                <span className="px-3 py-1 rounded-full text-sm font-medium bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  {billingStatus.memory} RAM
                </span>
              )}
            </div>

            {/* Trial Countdown */}
            {billingStatus.subscription_status === 'trialing' && billingStatus.trial_ends_at && (
              <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <p className="text-blue-200 text-sm">
                  Your 48-hour trial {billingStatus.is_trial_expired ? 'has ended' : 'ends'} on{' '}
                  <span className="font-medium">
                    {new Date(billingStatus.trial_ends_at).toLocaleString()}
                  </span>
                </p>
                {!billingStatus.is_trial_expired && (
                  <p className="text-blue-300 text-xs mt-1">
                    Subscribe now to continue using your server after the trial.
                  </p>
                )}
              </div>
            )}

            {/* Trial Expired Warning */}
            {billingStatus.is_trial_expired && billingStatus.subscription_status !== 'active' && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-red-200 text-sm font-medium">
                  Your trial has expired. Subscribe to continue using your server.
                </p>
              </div>
            )}

            {/* Upgrade Success Message */}
            {upgradeSuccess && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-start gap-2">
                <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-emerald-200 text-sm">{upgradeSuccess}</p>
              </div>
            )}

            {/* Past Due Warning */}
            {billingStatus.subscription_status === 'past_due' && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <p className="text-amber-200 text-sm">
                  Your payment has failed. Please update your payment method to avoid service interruption.
                </p>
              </div>
            )}

            {/* Plan Selection for new subscribers */}
            {showSubscribeOptions && (
              <div className="mt-4">
                <label className="text-slate-300 text-sm font-medium block mb-2">Select a Plan</label>
                <div className="grid grid-cols-2 gap-2">
                  {AVAILABLE_PLANS.map((plan) => (
                    <button
                      key={plan.plan_id}
                      onClick={() => onSelectPlan(plan.plan_id)}
                      disabled={isImpersonating}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        isImpersonating
                          ? 'border-slate-700 bg-slate-800/50 opacity-50 cursor-not-allowed'
                          : selectedPlan === plan.plan_id
                          ? 'border-emerald-500 bg-emerald-500/10'
                          : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                      }`}
                    >
                      <span className={`font-semibold block ${
                        isImpersonating ? 'text-slate-400' : selectedPlan === plan.plan_id ? 'text-emerald-400' : 'text-white'
                      }`}>
                        {plan.display_name}
                      </span>
                      <span className={`text-xs block ${
                        isImpersonating ? 'text-slate-500' : selectedPlan === plan.plan_id ? 'text-emerald-400/50' : 'text-slate-500'
                      }`}>
                        {plan.memory.replace('G', ' GB RAM')}
                      </span>
                      <span className={`text-sm ${
                        isImpersonating ? 'text-slate-500' : selectedPlan === plan.plan_id ? 'text-emerald-400/70' : 'text-slate-400'
                      }`}>
                        {plan.price}/mo
                      </span>
                    </button>
                  ))}
                </div>

                {/* Referral Code Input for new subscribers */}
                <div className="mt-4 p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                  <p className="text-purple-200 text-sm mb-3">
                    Have a friend&apos;s referral code? Enter it below and you both get a free month!
                  </p>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={referralCodeInput}
                        onChange={(e) => {
                          setReferralCodeInput(e.target.value.toUpperCase())
                          onClearValidation()
                        }}
                        placeholder="Enter referral code"
                        disabled={isImpersonating}
                        maxLength={8}
                        className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-purple-500 font-mono tracking-wider"
                      />
                      <button
                        onClick={handleValidateCode}
                        disabled={isImpersonating || validating || !referralCodeInput.trim()}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg text-white text-sm font-medium transition-colors"
                      >
                        {validating ? (
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : 'Verify'}
                      </button>
                    </div>

                    {validationResult && (
                      <div className={`p-2 rounded-lg text-sm ${
                        validationResult.valid
                          ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                          : 'bg-red-500/10 border border-red-500/30 text-red-300'
                      }`}>
                        {validationResult.valid ? (
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            {validationResult.message}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            {validationResult.message}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 mt-4">
              {showSubscribeOptions && (
                <button
                  onClick={handleSubscribeClick}
                  disabled={billingLoading || isImpersonating || (referralCodeInput.trim() !== '' && !validationResult?.valid)}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed font-semibold shadow-lg hover:shadow-emerald-500/50 transition-all duration-200 transform hover:scale-[1.02] disabled:transform-none flex items-center justify-center gap-2"
                >
                  {billingLoading ? (
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                      </svg>
                      {validationResult?.valid
                        ? `Subscribe - First Month Free!`
                        : `Subscribe to ${AVAILABLE_PLANS.find(p => p.plan_id === selectedPlan)?.display_name}`
                      }
                    </>
                  )}
                </button>
              )}

              {(billingStatus.subscription_status === 'active' ||
                billingStatus.subscription_status === 'past_due') && (
                <button
                  onClick={onManageSubscription}
                  disabled={billingLoading || isImpersonating}
                  className="flex-1 py-3 px-4 rounded-xl bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed font-semibold shadow-lg transition-all duration-200 transform hover:scale-[1.02] disabled:transform-none border border-slate-600 flex items-center justify-center gap-2"
                >
                  {billingLoading ? (
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Manage Subscription
                    </>
                  )}
                </button>
              )}

              {/* Upgrade Button - only show for active subscriptions with upgrade available */}
              {billingStatus.subscription_status === 'active' && getNextPlan(billingStatus.plan_id) && (
                <button
                  onClick={onShowUpgradeModal}
                  disabled={billingLoading || isImpersonating}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed font-semibold shadow-lg hover:shadow-indigo-500/50 transition-all duration-200 transform hover:scale-[1.02] disabled:transform-none flex items-center justify-center gap-2"
                >
                  {billingLoading ? (
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                      </svg>
                      Upgrade to {getNextPlan(billingStatus.plan_id)?.display_name} ({getNextPlan(billingStatus.plan_id)?.price}/mo)
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <svg className="animate-spin h-6 w-6 text-slate-400 mx-auto mb-2" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <p className="text-slate-400">Loading billing status...</p>
          </div>
        )}
      </div>

      {/* Refer Friends Section - show for active subscribers */}
      {billingStatus?.subscription_status === 'active' && (
        <div className="p-4 bg-slate-800/50 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className="text-white font-medium">Refer Friends</span>
          </div>

          {referralLoading ? (
            <div className="flex items-center justify-center py-4">
              <svg className="animate-spin h-5 w-5 text-slate-400" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : referralData ? (
            <div className="space-y-3">
              {/* Description */}
              <p className="text-slate-300 text-sm">
                Share your code with friends and you both get a free month! When they subscribe with your code, they get their first month free and you get a month of credit.
              </p>

              {/* Referral Code */}
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2">
                  <span className="text-slate-400 text-xs block">Your Referral Code</span>
                  <span className="text-white font-mono text-lg tracking-wider">{referralData.referral_code}</span>
                </div>
                <button
                  onClick={onCopyCode}
                  className="p-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                  title="Copy code"
                >
                  {copySuccess ? (
                    <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <span className="text-slate-400 text-xs block">Successful Referrals</span>
                  <span className="text-white text-lg font-semibold">
                    {referralData.stats.successful_referrals} / {referralData.max_referrals}
                  </span>
                </div>
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <span className="text-slate-400 text-xs block">Credits Earned</span>
                  <span className="text-emerald-400 text-lg font-semibold">
                    {formatCredits(referralData.stats.credits_earned_cents)}
                  </span>
                </div>
              </div>

              {/* Cap Warning */}
              {referralData.stats.credits_cap_reached && (
                <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <p className="text-amber-300 text-sm">
                    You&apos;ve reached the maximum referral credits. Thank you for spreading the word!
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-slate-400 text-sm">Unable to load referral information.</p>
          )}
        </div>
      )}

      {/* Payment Info */}
      <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700">
        <p className="text-slate-400 text-sm">
          Payments are processed securely by Stripe. You can upgrade, downgrade, or cancel your subscription at any time
          from the Manage Subscription page.
        </p>
      </div>
    </div>
  )
}
