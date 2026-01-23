'use client'

import { AVAILABLE_PLANS } from '@/app/lib/constants'

interface PaymentModalProps {
  paymentError: string | null
  selectedPlan: string
  billingLoading: boolean
  onSelectPlan: (planId: string) => void
  onSubscribe: (planId: string) => void
  onClose: () => void
}

export function PaymentModal({
  paymentError,
  selectedPlan,
  billingLoading,
  onSelectPlan,
  onSubscribe,
  onClose,
}: PaymentModalProps) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-700 max-w-md w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Subscription Required</h3>
            <p className="text-slate-400 text-sm">Your trial has expired</p>
          </div>
        </div>

        <p className="text-slate-300 mb-4">
          {paymentError || 'Your 48-hour trial has ended. Subscribe now to continue using your Minecraft server.'}
        </p>

        {/* Plan Selection */}
        <div className="mb-4">
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

        <div className="space-y-3">
          <button
            onClick={() => {
              onClose()
              onSubscribe(selectedPlan)
            }}
            disabled={billingLoading}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed font-semibold shadow-lg hover:shadow-emerald-500/50 transition-all duration-200 transform hover:scale-[1.02] disabled:transform-none flex items-center justify-center gap-2"
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
