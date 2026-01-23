'use client'

import { BillingStatus, Plan } from '@/app/lib/types'

interface UpgradeModalProps {
  billingStatus: BillingStatus
  billingLoading: boolean
  getCurrentPlan: (planId: string | null) => Plan | null
  getNextPlan: (planId: string | null) => Plan | null
  onUpgrade: () => void
  onClose: () => void
}

export function UpgradeModal({
  billingStatus,
  billingLoading,
  getCurrentPlan,
  getNextPlan,
  onUpgrade,
  onClose,
}: UpgradeModalProps) {
  const currentPlan = getCurrentPlan(billingStatus.plan_id)
  const nextPlan = getNextPlan(billingStatus.plan_id)

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-700 max-w-md w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Confirm Upgrade</h3>
            <p className="text-slate-400 text-sm">Upgrade your server RAM</p>
          </div>
        </div>

        {/* Plan Comparison */}
        <div className="flex items-center gap-3 mb-6">
          {/* Current Plan */}
          <div className="flex-1 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
            <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Current Plan</p>
            <p className="text-white font-semibold text-lg">{currentPlan?.display_name}</p>
            <p className="text-slate-400 text-sm">{currentPlan?.price}/mo</p>
          </div>

          {/* Arrow */}
          <div className="flex-shrink-0">
            <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </div>

          {/* New Plan */}
          <div className="flex-1 p-4 bg-indigo-500/10 rounded-xl border border-indigo-500/30">
            <p className="text-indigo-400 text-xs uppercase tracking-wide mb-1">New Plan</p>
            <p className="text-white font-semibold text-lg">{nextPlan?.display_name}</p>
            <p className="text-indigo-400 text-sm">{nextPlan?.price}/mo</p>
          </div>
        </div>

        <p className="text-slate-400 text-sm mb-6">
          You will be charged the prorated difference for the remainder of your billing period. Restart your server after upgrading to apply the new RAM allocation.
        </p>

        <div className="space-y-3">
          <button
            onClick={() => {
              onClose()
              onUpgrade()
            }}
            disabled={billingLoading}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed font-semibold shadow-lg hover:shadow-indigo-500/50 transition-all duration-200 transform hover:scale-[1.02] disabled:transform-none flex items-center justify-center gap-2"
          >
            {billingLoading ? (
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Confirm Upgrade
              </>
            )}
          </button>

          <button
            onClick={onClose}
            className="w-full py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
