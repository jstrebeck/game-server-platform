'use client'

interface CapacityModalProps {
  onClose: () => void
}

export function CapacityModal({ onClose }: CapacityModalProps) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-700 max-w-md w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-rose-500/20 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">We're at Capacity</h3>
            <p className="text-slate-400 text-sm">High demand right now</p>
          </div>
        </div>

        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl mb-4">
          <p className="text-rose-200 text-sm">
            Our servers are currently running at full capacity. We're working hard to add more resources.
          </p>
        </div>

        <p className="text-slate-300 mb-6">
          Please try again later. We appreciate your patience and apologize for any inconvenience.
        </p>

        <button
          onClick={onClose}
          className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  )
}
