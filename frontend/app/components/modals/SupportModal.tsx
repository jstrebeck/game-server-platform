'use client'

import { useState } from 'react'

interface SupportModalProps {
  supportLoading: boolean
  supportMessage: string | null
  supportError: string | null
  userEmail?: string
  onSubmit: (subject: string, message: string, userEmail?: string) => Promise<boolean>
  onClose: () => void
}

export function SupportModal({
  supportLoading,
  supportMessage,
  supportError,
  userEmail,
  onSubmit,
  onClose,
}: SupportModalProps) {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subject.trim() || !message.trim()) return

    const success = await onSubmit(subject, message, userEmail)
    if (success) {
      setSubject('')
      setMessage('')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-700 max-w-lg w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Contact Support</h3>
            <p className="text-slate-400 text-sm">We're here to help!</p>
          </div>
        </div>

        {supportMessage ? (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-start gap-3">
              <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-emerald-200 text-sm">{supportMessage}</p>
            </div>
            <button
              onClick={onClose}
              className="w-full py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {supportError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
                <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-red-200 text-sm">{supportError}</p>
              </div>
            )}

            <div>
              <label className="text-slate-300 text-sm font-medium block mb-2">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Brief description of your issue"
                maxLength={100}
                required
                className="w-full py-2 px-3 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-slate-300 text-sm font-medium block mb-2">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Please describe your problem in detail..."
                rows={5}
                maxLength={2000}
                required
                className="w-full py-2 px-3 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors resize-none"
              />
              <p className="text-slate-500 text-xs mt-1">{message.length}/2000 characters</p>
            </div>

            <div className="space-y-3 pt-2">
              <button
                type="submit"
                disabled={supportLoading || !subject.trim() || !message.trim()}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed font-semibold shadow-lg hover:shadow-blue-500/50 transition-all duration-200 transform hover:scale-[1.02] disabled:transform-none flex items-center justify-center gap-2"
              >
                {supportLoading ? (
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Send Message
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
