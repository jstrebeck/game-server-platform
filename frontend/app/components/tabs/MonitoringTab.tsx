'use client'

import { ServerResult, BillingStatus, Metrics } from '@/app/lib/types'

interface MonitoringTabProps {
  result: ServerResult
  billingStatus: BillingStatus | null
  metrics: Metrics | null
  loading: boolean
  showLogs: boolean
  onStartServer: () => void
  onRestartServer: () => void
  onDeleteServer: () => void
  onViewLogs: () => void
}

export function MonitoringTab({
  result,
  billingStatus,
  metrics,
  loading,
  showLogs,
  onStartServer,
  onRestartServer,
  onDeleteServer,
  onViewLogs,
}: MonitoringTabProps) {
  const planMemoryStr = billingStatus?.memory || '2G'
  const planMemoryGB = parseInt(planMemoryStr.replace('G', '')) || 2
  const planMemoryBytes = planMemoryGB * 1024 * 1024 * 1024

  const usedBytes = metrics?.memory_bytes || 0
  const usedGB = usedBytes / (1024 * 1024 * 1024)
  const usagePercent = Math.min((usedBytes / planMemoryBytes) * 100, 100)

  const getBarColor = () => {
    if (usagePercent >= 90) return 'from-red-500 to-rose-500'
    if (usagePercent >= 70) return 'from-amber-500 to-yellow-500'
    return 'from-cyan-500 to-blue-500'
  }

  const getTextColor = () => {
    if (usagePercent >= 90) return 'text-red-400'
    if (usagePercent >= 70) return 'text-amber-400'
    return 'text-cyan-400'
  }

  return (
    <div className="space-y-4 mb-4">
      {/* RAM Usage */}
      {result.status === 'ready' && (
        <div className="p-4 bg-slate-800/50 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-slate-300 font-medium">RAM Usage</span>
            <span className={`font-mono text-sm font-semibold ${getTextColor()}`}>
              {metrics ? `${usedGB.toFixed(1)} GB / ${planMemoryGB} GB` : 'Loading...'}
            </span>
          </div>

          <div className="relative">
            <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full bg-gradient-to-r ${getBarColor()} transition-all duration-500 ease-out`}
                style={{ width: `${metrics ? usagePercent : 0}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs text-slate-500">0 GB</span>
              <span className={`text-xs font-medium ${getTextColor()}`}>
                {metrics ? `${usagePercent.toFixed(0)}%` : '—'}
              </span>
              <span className="text-xs text-slate-500">{planMemoryGB} GB</span>
            </div>
          </div>
        </div>
      )}

      {/* Server Control Button */}
      {result.status === 'ready' ? (
        <button
          onClick={onRestartServer}
          disabled={loading}
          className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed font-semibold shadow-lg hover:shadow-amber-500/50 transition-all duration-200 transform hover:scale-[1.02] disabled:transform-none flex items-center justify-center gap-2"
        >
          {loading ? (
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Restart Server
            </>
          )}
        </button>
      ) : (
        <button
          onClick={onStartServer}
          disabled={loading}
          className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed font-semibold shadow-lg hover:shadow-emerald-500/50 transition-all duration-200 transform hover:scale-[1.02] disabled:transform-none flex items-center justify-center gap-2"
        >
          {loading ? (
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              Start Server
            </>
          )}
        </button>
      )}

      {/* Server Logs Button */}
      {!showLogs && (
        <button
          onClick={onViewLogs}
          className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-slate-700 to-slate-600 hover:from-slate-600 hover:to-slate-500 font-semibold shadow-lg transition-all duration-200 transform hover:scale-[1.02] flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          View Server Logs
        </button>
      )}

      {/* Delete Button */}
      <button
        onClick={onDeleteServer}
        disabled={loading}
        className="w-full py-2 px-4 rounded-xl bg-slate-800 hover:bg-red-900/50 border border-slate-700 hover:border-red-500/50 disabled:bg-slate-800 disabled:cursor-not-allowed text-slate-400 hover:text-red-400 text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        Delete Server
      </button>
    </div>
  )
}
