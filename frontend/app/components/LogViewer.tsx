'use client'

import { RefObject } from 'react'

interface LogViewerProps {
  logs: string[]
  wsConnected: boolean
  logsEndRef: RefObject<HTMLDivElement | null>
  onDisconnect: () => void
  onRetry: () => void
}

export function LogViewer({
  logs,
  wsConnected,
  logsEndRef,
  onDisconnect,
  onRetry,
}: LogViewerProps) {
  return (
    <div className="border-t border-slate-800 bg-slate-950/50 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">Server Logs</h3>
          {wsConnected ? (
            <span className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
              <span className="text-xs font-medium">Live</span>
            </span>
          ) : (
            <>
              <span className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                <span className="w-2 h-2 bg-red-400 rounded-full"></span>
                <span className="text-xs font-medium">Disconnected</span>
              </span>
              <button
                onClick={onRetry}
                className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Retry
              </button>
            </>
          )}
        </div>
        <button
          onClick={onDisconnect}
          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Close
        </button>
      </div>

      <div className="bg-black/50 rounded-xl border border-slate-800 p-4 h-96 overflow-y-auto font-mono text-xs shadow-inner">
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <svg className="w-8 h-8 text-slate-600 mx-auto mb-2 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-slate-500">Waiting for logs...</p>
            </div>
          </div>
        ) : (
          <div className="space-y-0.5">
            {logs.map((log, idx) => (
              <div
                key={idx}
                className="text-emerald-400/90 whitespace-pre-wrap break-all leading-relaxed hover:bg-slate-900/30 px-2 py-0.5 rounded transition-colors"
              >
                {log}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>Logs update in real-time {logs.length} line{logs.length !== 1 ? 's' : ''}</span>
      </div>
    </div>
  )
}
