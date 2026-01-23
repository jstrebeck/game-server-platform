'use client'

import { BillingStatus, Plan } from '@/app/lib/types'
import { AVAILABLE_PLANS } from '@/app/lib/constants'

interface BillingTabProps {
  billingStatus: BillingStatus | null
  billingLoading: boolean
  selectedPlan: string
  upgradeSuccess: string | null
  onSelectPlan: (planId: string) => void
  onSubscribe: (planId: string) => void
  onManageSubscription: () => void
  onShowUpgradeModal: () => void
  getNextPlan: (planId: string | null) => Plan | null
}

export function BillingTab({
  billingStatus,
  billingLoading,
  selectedPlan,
  upgradeSuccess,
  onSelectPlan,
  onSubscribe,
  onManageSubscription,
  onShowUpgradeModal,
  getNextPlan,
}: BillingTabProps) {
  return (
    <div className="space-y-4 mb-4">
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
            {(billingStatus.subscription_status === 'none' ||
              billingStatus.subscription_status === 'trialing' ||
              billingStatus.subscription_status === 'canceled' ||
              billingStatus.is_trial_expired) && (
              <div className="mt-4">
                <label className="text-slate-300 text-sm font-medium block mb-2">Select a Plan</label>
                <div className="grid grid-cols-2 gap-2">
                  {AVAILABLE_PLANS.map((plan) => (
                    <button
                      key={plan.plan_id}
                      onClick={() => onSelectPlan(plan.plan_id)}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        selectedPlan === plan.plan_id
                          ? 'border-emerald-500 bg-emerald-500/10'
                          : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                      }`}
                    >
                      <span className={`font-semibold block ${
                        selectedPlan === plan.plan_id ? 'text-emerald-400' : 'text-white'
                      }`}>
                        {plan.display_name}
                      </span>
                      <span className={`text-sm ${
                        selectedPlan === plan.plan_id ? 'text-emerald-400/70' : 'text-slate-400'
                      }`}>
                        {plan.price}/mo
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 mt-4">
              {(billingStatus.subscription_status === 'none' ||
                billingStatus.subscription_status === 'trialing' ||
                billingStatus.subscription_status === 'canceled' ||
                billingStatus.is_trial_expired) && (
                <button
                  onClick={() => onSubscribe(selectedPlan)}
                  disabled={billingLoading}
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
                      Subscribe to {AVAILABLE_PLANS.find(p => p.plan_id === selectedPlan)?.display_name}
                    </>
                  )}
                </button>
              )}

              {(billingStatus.subscription_status === 'active' ||
                billingStatus.subscription_status === 'past_due') && (
                <button
                  onClick={onManageSubscription}
                  disabled={billingLoading}
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
                  disabled={billingLoading}
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
