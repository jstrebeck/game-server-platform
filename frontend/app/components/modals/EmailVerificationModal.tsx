'use client'

import { useState } from 'react'

interface EmailVerificationModalProps {
  userEmail?: string
  onClose: () => void
  onRefreshToken: () => Promise<void>
}

export function EmailVerificationModal({
  userEmail,
  onClose,
  onRefreshToken,
}: EmailVerificationModalProps) {
  const [refreshing, setRefreshing] = useState(false)

  const handleClose = async () => {
    setRefreshing(true)
    try {
      await onRefreshToken()
    } finally {
      setRefreshing(false)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-700 max-w-md w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Verify Your Email</h3>
            <p className="text-slate-400 text-sm">One more step to get started</p>
          </div>
        </div>

        <p className="text-slate-300 mb-4">
          Please verify your email address before creating or starting a server. Check your inbox for a verification email.
        </p>

        {userEmail && (
          <div className="bg-slate-800/50 rounded-lg p-3 mb-4">
            <p className="text-slate-400 text-sm">Verification email sent to:</p>
            <p className="text-white font-medium">{userEmail}</p>
          </div>
        )}

        <div className="bg-slate-800/30 rounded-lg p-4 mb-4">
          <h4 className="text-slate-200 font-medium mb-2">Didn't receive the email?</h4>
          <ul className="text-slate-400 text-sm space-y-1">
            <li>Check your spam or junk folder</li>
            <li>Make sure your email address is correct</li>
            <li>Try logging out and back in to resend</li>
          </ul>
        </div>

        <button
          onClick={handleClose}
          disabled={refreshing}
          className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800 disabled:cursor-not-allowed text-slate-300 font-medium transition-colors flex items-center justify-center gap-2"
        >
          {refreshing ? (
            <>
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Refreshing...
            </>
          ) : (
            'Close'
          )}
        </button>
      </div>
    </div>
  )
}
